import { createHash } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
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
	data: Uint8Array;
}

export interface PreparedChapter extends Chapter {
	xhtml: string;
	language: string;
	images: ImageResource[];
}

export class ChapterPreparer {
	private images = new Map<string, ImageResource>();

	constructor(
		private request: Request,
		private downloadImages: boolean,
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
			for (const image of document.querySelectorAll('img')) {
				if (!this.downloadImages) {
					image.replaceWith(document.createTextNode(image.alt));
					continue;
				}
				const source = image.getAttribute('src');
				if (!source) {
					image.replaceWith(document.createTextNode(image.alt));
					continue;
				}
				const resource = await this.loadImage(source);
				resources.set(resource.name, resource);
				image.setAttribute('src', '../Images/' + resource.name);
				image.removeAttribute('width');
				image.removeAttribute('height');
			}
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
			return { ...chapter, xhtml, language, images: [...resources.values()] };
		} finally {
			dom.window.close();
		}
	}

	private async loadImage(source: string): Promise<ImageResource> {
		const cached = this.images.get(source);
		if (cached) return cached;
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
		const metadata = await sharp(body).metadata();
		let extension: string;
		let mediaType: string;
		let data: Buffer;
		if (
			['jpeg', 'png', 'gif'].includes(metadata.format || '') &&
			(metadata.width || 0) <= 2400
		) {
			extension = metadata.format === 'jpeg' ? 'jpg' : metadata.format!;
			mediaType = 'image/' + metadata.format;
			data = body;
		} else {
			extension = 'png';
			mediaType = 'image/png';
			data = await sharp(body)
				.rotate()
				.resize({ width: 2400, withoutEnlargement: true })
				.png()
				.toBuffer();
		}
		const name =
			createHash('sha256').update(data).digest('hex') + '.' + extension;
		const resource = { name, mediaType, data };
		this.images.set(source, resource);
		return resource;
	}
}

export function buildEpub(
	chapters: PreparedChapter[],
	book: BookMetadata,
	customCss: string,
): Buffer {
	if (!chapters.length) throw new Error('No chapters to package');
	if (!book.title.trim()) throw new Error('Book title is required');
	const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
	const files: Record<string, Uint8Array> = {
		'META-INF/container.xml': strToU8(
			`<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
		),
		'OEBPS/Styles/stylesheet.css': strToU8(stylesheet + '\n' + customCss),
	};
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
		files['OEBPS/' + href] = strToU8(chapter.xhtml);
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
		files['OEBPS/Images/' + image.name] = image.data;
		manifest.push(
			`<item id="image-${index}" href="Images/${image.name}" media-type="${image.mediaType}"/>`,
		);
	}
	files['OEBPS/nav.xhtml'] =
		strToU8(`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(book.language)}"><head><title>${escapeXml(book.title)}</title><link rel="stylesheet" type="text/css" href="Styles/stylesheet.css"/></head><body><nav epub:type="toc"><h1>${escapeXml(book.title)}</h1><ol>${navigation.join('')}</ol></nav></body></html>`);
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
	files['OEBPS/content.opf'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${escapeXml(book.identifier)}</dc:identifier><dc:title>${escapeXml(book.title)}</dc:title><dc:language>${escapeXml(book.language)}</dc:language><meta property="dcterms:modified">${modified}</meta>${metadata}</metadata><manifest>${manifest.join('')}</manifest><spine>${spine.join('')}</spine></package>`);
	return Buffer.from(
		zipSync(
			{ mimetype: [strToU8('application/epub+zip'), { level: 0 }], ...files },
			{ level: 6 },
		),
	);
}
