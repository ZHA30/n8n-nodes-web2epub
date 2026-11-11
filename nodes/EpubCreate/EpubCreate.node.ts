import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { buildEpub, ChapterPreparer } from '../shared/epub';
import type { Chapter, PreparedChapter } from '../shared/epub';
import { bookMetadataFields, resolveMetadata } from './metadata';
import type { BookMetadata } from './metadata';

// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool -- Aggregates workflow items and exposes three separate outputs.
export class EpubCreate implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'EPUB Create',
		name: 'epubCreate',
		icon: {
			light: 'file:book-open.light.svg',
			dark: 'file:book-open.dark.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle: '={{ $parameter.options?.bookMetadata?.title || "" }}',
		description: 'Combine HTML chapters into an EPUB book',
		defaults: { name: 'EPUB Create' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [
			NodeConnectionTypes.Main,
			NodeConnectionTypes.Main,
			NodeConnectionTypes.Main,
		],
		outputNames: ['EPUB', 'Successful Items', 'Failed Items'],
		properties: [
			{
				displayName: 'Chapter Title',
				name: 'chapterTitle',
				type: 'string',
				default: '',
				required: true,
			},
			{
				displayName: 'HTML Content',
				name: 'content',
				type: 'string',
				default: '',
				required: true,
				typeOptions: { rows: 5 },
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				default: {},
				placeholder: 'Add Option',
				description: 'Evaluated using the first input item',
				options: [
					{
						displayName: 'Book Metadata',
						name: 'bookMetadata',
						type: 'collection',
						default: {},
						placeholder: 'Add Metadata',
						options: bookMetadataFields,
					},
					{
						displayName: 'Custom CSS',
						name: 'customCss',
						type: 'string',
						default: '',
						typeOptions: { rows: 5 },
						description: 'Appended after the default stylesheet',
					},
					{
						displayName: 'File Name',
						name: 'fileName',
						type: 'string',
						default: '',
						placeholder: 'book.epub',
					},
				],
			},
			{
				displayName: 'Download Images',
				name: 'downloadImages',
				type: 'boolean',
				default: true,
				description:
					'Whether to embed images. When disabled, images are replaced with their alternative text.',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		if (!items.length) return [[], [], []];
		const successful: INodeExecutionData[] = [];
		const failed: INodeExecutionData[] = [];
		const chapters: PreparedChapter[] = [];
		const options = this.getNodeParameter('options', 0) as {
			bookMetadata?: Partial<BookMetadata>;
			customCss?: string;
			fileName?: string;
		};
		const directory = await mkdtemp(join(tmpdir(), 'web2epub-'));
		try {
			const preparer = new ChapterPreparer(
				this.helpers.httpRequest,
				this.getNodeParameter('downloadImages', 0) as boolean,
				directory,
			);
			for (let index = 0; index < items.length; index++) {
				try {
					const chapter: Chapter = {
						inputIndex: index,
						title: this.getNodeParameter('chapterTitle', index) as string,
						content: this.getNodeParameter('content', index) as string,
					};
					const prepared = await preparer.prepare(chapter);
					chapters.push(prepared);
					successful.push({
						json: {
							...items[index].json,
							title: chapter.title,
							content: chapter.content,
							chapterIndex: chapters.length,
						},
						pairedItem: { item: index },
					});
				} catch (error) {
					failed.push({
						json: {
							...items[index].json,
							stage: 'generate',
							error: (error as Error).message,
						},
						pairedItem: { item: index },
					});
				}
			}
			if (!chapters.length) return [[], [], failed];
			try {
				const fileName = options.fileName?.trim() || 'book.epub';
				const book = resolveMetadata(
					options.bookMetadata || {},
					chapters,
					fileName,
				);
				const outputPath = join(directory, 'book.epub');
				await buildEpub(chapters, book, options.customCss || '', outputPath);
				const stream = createReadStream(outputPath);
				let binary;
				try {
					binary = await this.helpers.prepareBinaryData(
						stream,
						fileName.endsWith('.epub') ? fileName : fileName + '.epub',
						'application/epub+zip',
					);
				} finally {
					stream.destroy();
				}
				return [
					[
						{
							json: {
								...book,
								chapterCount: chapters.length,
								failedCount: failed.length,
							},
							binary: { data: binary },
							pairedItem: chapters.map((chapter) => ({
								item: chapter.inputIndex,
							})),
						},
					],
					successful,
					failed,
				];
			} catch (error) {
				throw new NodeOperationError(this.getNode(), error as Error);
			}
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	}
}
