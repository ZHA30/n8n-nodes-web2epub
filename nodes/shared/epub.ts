import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';
import { mapConcurrent } from './concurrency';
import sharp from 'sharp';
import { cleanHtml, escapeXml, fragmentDom, normalizeImages } from './html';
import { fetchResource } from './http';
import type { Request } from './http';
import { stylesheet } from './styles';
import { detectLanguage } from './language';
import type { BookMetadata } from '../EpubCreate/metadata';

export interface Chapter {
	inputIndex: number;
	title: string;
	content: string;
}

interface ImageResource {
	name: string;
	mediaType: string;
	path: string;
}

export interface PreparedChapter extends Chapter {
	path: string;
	language: string;
	images: ImageResource[];
}

export class ChapterPreparer {
	private images = new Map<string, Promise<ImageResource>>();
	private conversion: Promise<unknown> = Promise.resolve();

	constructor(
		private request: Request,
		private downloadImages: boolean,
		private directory: string,
	) {}

	async prepare(chapter: Chapter): Promise<PreparedChapter> {
		if (!chapter.title.trim()) throw new Error('Chapter title is required');
		if (!chapter.content.trim()) throw new Error('Chapter content is required');
		const dom = fragmentDom(chapter.content);
		try {
			const document = dom.window.document;
			normalizeImages(document);
			document.body.innerHTML = cleanHtml(document.body.innerHTML);
			const resources = new Map<string, ImageResource>();
			await mapConcurrent(
				[...document.querySelectorAll('img')],
				3,
				async (image) => {
					if (!this.downloadImages) {
						image.replaceWith(document.createTextNode(image.alt));
						return;
					}
					const source = image.getAttribute('src');
					if (!source) {
						image.replaceWith(document.createTextNode(image.alt));
						return;
					}
					const resource = await this.loadImage(source);
					resources.set(resource.name, resource);
					image.setAttribute('src', '../Images/' + resource.name);
					image.removeAttribute('width');
					image.removeAttribute('height');
				},
			);
			if (!document.body.textContent?.trim() && !document.querySelector('img'))
				throw new Error('Chapter content is empty');
			const serializer = new dom.window.XMLSerializer();
			const content = Array.from(document.body.childNodes, (node) =>
				serializer.serializeToString(node),
			).join('');
			const language = detectLanguage(document.body.textContent || '');
			const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
<head><title>${escapeXml(chapter.title)}</title><link rel="stylesheet" type="text/css" href="../Styles/stylesheet.css"/></head>
<body><h1 class="title">${escapeXml(chapter.title)}</h1><main class="content">${content}</main></body></html>`;
			const path = join(this.directory, `chapter-${chapter.inputIndex}.xhtml`);
			await writeFile(path, xhtml);
			return { ...chapter, path, language, images: [...resources.values()] };
		} finally {
			dom.window.close();
		}
	}

	private loadImage(source: string): Promise<ImageResource> {
		let resource = this.images.get(source);
		if (!resource) {
			resource = this.downloadImage(source);
			this.images.set(source, resource);
		}
		return resource;
	}

	private async downloadImage(source: string): Promise<ImageResource> {
		let body: Buffer;
		if (source.startsWith('data:')) {
			const match = /^data:image\/[^;,]+(;base64)?,([\s\S]+)$/i.exec(source);
			if (!match) throw new Error('Unsupported image data URL');
			body = match[1]
				? Buffer.from(match[2], 'base64')
				: Buffer.from(decodeURIComponent(match[2]));
		} else {
			body = (await fetchResource(this.request, source)).body;
		}
		const sourcePath = join(
			this.directory,
			createHash('sha256').update(source).digest('hex'),
		);
		await writeFile(sourcePath, body);
		const conversion = this.conversion.then(() =>
			this.convertImage(sourcePath),
		);
		this.conversion = conversion.catch(() => undefined);
		return await conversion;
	}

	private async convertImage(sourcePath: string): Promise<ImageResource> {
		const metadata = await sharp(sourcePath).metadata();
		let extension: string;
		let mediaType: string;
		let path = sourcePath;
		if (
			['jpeg', 'png', 'gif'].includes(metadata.format || '') &&
			(metadata.width || 0) <= 2400
		) {
			extension = metadata.format === 'jpeg' ? 'jpg' : metadata.format!;
			mediaType = 'image/' + metadata.format;
		} else {
			extension = 'png';
			mediaType = 'image/png';
			path = sourcePath + '.png';
			await sharp(sourcePath)
				.rotate()
				.resize({ width: 2400, withoutEnlargement: true })
				.png()
				.toFile(path);
			await unlink(sourcePath);
		}
		const hash = createHash('sha256');
		for await (const chunk of createReadStream(path)) hash.update(chunk);
		return { name: hash.digest('hex') + '.' + extension, mediaType, path };
	}
}

export async function buildEpub(
	chapters: PreparedChapter[],
	book: BookMetadata,
	customCss: string,
	outputPath: string,
): Promise<void> {
	if (!chapters.length) throw new Error('No chapters to package');
	if (!book.title.trim()) throw new Error('Book title is required');
	const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
	const zip = new ZipFile();
	const stream = zip.outputStream as Readable;
	const output = createWriteStream(outputPath);
	const completed = pipeline(stream, output);
	zip.on('error', (error: Error) => stream.destroy(error));
	try {
		zip.addBuffer(Buffer.from('application/epub+zip'), 'mimetype', {
			compress: false,
		});
		zip.addBuffer(
			Buffer.from(
				`<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
			),
			'META-INF/container.xml',
		);
		zip.addBuffer(
			Buffer.from(stylesheet + '\n' + customCss),
			'OEBPS/Styles/stylesheet.css',
		);
		const manifest = [
			'<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
			'<item id="css" href="Styles/stylesheet.css" media-type="text/css"/>',
		];
		const spine: string[] = [];
		const navigation: string[] = [];
		const images = new Map<string, ImageResource>();
		for (const [index, chapter] of chapters.entries()) {
			const id = `chapter-${index + 1}`;
			const href = `Text/${id}.xhtml`;
			zip.addFile(chapter.path, 'OEBPS/' + href);
			manifest.push(
				`<item id="${id}" href="${href}" media-type="application/xhtml+xml"/>`,
			);
			spine.push(`<itemref idref="${id}"/>`);
			navigation.push(
				`<li><a href="${href}">${escapeXml(chapter.title)}</a></li>`,
			);
			for (const image of chapter.images) images.set(image.name, image);
		}
		for (const [index, image] of [...images.values()].entries()) {
			zip.addFile(image.path, 'OEBPS/Images/' + image.name, {
				compress: false,
			});
			manifest.push(
				`<item id="image-${index}" href="Images/${image.name}" media-type="${image.mediaType}"/>`,
			);
		}
		zip.addBuffer(
			Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(book.language)}"><head><title>${escapeXml(book.title)}</title><link rel="stylesheet" type="text/css" href="Styles/stylesheet.css"/></head><body><nav epub:type="toc"><h1>${escapeXml(book.title)}</h1><ol>${navigation.join('')}</ol></nav></body></html>`),
			'OEBPS/nav.xhtml',
		);
		const optional = {
			creator: book.creator,
			contributor: book.contributor,
			subject: book.subject,
			description: book.description,
			publisher: book.publisher,
			date: book.date,
			rights: book.rights,
			source: book.source,
		};
		const metadata = Object.entries(optional)
			.flatMap(([tag, value]) =>
				(Array.isArray(value) ? value : [value])
					.filter((entry): entry is string => !!entry?.trim())
					.map((entry) => `<dc:${tag}>${escapeXml(entry)}</dc:${tag}>`),
			)
			.join('');
		const series = book.series?.trim()
			? `<meta property="belongs-to-collection" id="series">${escapeXml(book.series.trim())}</meta><meta refines="#series" property="collection-type">series</meta>${book.seriesPosition !== undefined ? `<meta refines="#series" property="group-position">${book.seriesPosition}</meta>` : ''}`
			: '';
		zip.addBuffer(
			Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${escapeXml(book.identifier)}</dc:identifier><dc:title>${escapeXml(book.title)}</dc:title><dc:language>${escapeXml(book.language)}</dc:language><meta property="dcterms:modified">${modified}</meta>${metadata}${series}</metadata><manifest>${manifest.join('')}</manifest><spine>${spine.join('')}</spine></package>`),
			'OEBPS/content.opf',
		);
		zip.end();
		await completed;
	} catch (error) {
		stream.destroy(error as Error);
		await completed.catch(() => undefined);
		// eslint-disable-next-line @n8n/community-nodes/require-node-api-error -- The node execution boundary wraps errors with item context.
		throw error;
	}
}
