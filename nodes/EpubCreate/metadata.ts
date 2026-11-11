import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { INodeProperties } from 'n8n-workflow';
import { normalizeLanguage } from '../shared/language';

export interface BookMetadata {
	title: string;
	identifier: string;
	language: string;
	creator?: string[];
	contributor?: string[];
	subject?: string[];
	description?: string;
	publisher?: string;
	date?: string;
	rights?: string;
	source?: string;
}

export const bookMetadataFields: INodeProperties[] = [
	{
		displayName: 'Contributor',
		name: 'contributor',
		type: 'string',
		default: [],
		typeOptions: { multipleValues: true },
		description: 'People or organizations contributing to the book',
	},
	{
		displayName: 'Creator',
		name: 'creator',
		type: 'string',
		default: [],
		typeOptions: { multipleValues: true },
		description: 'Authors or other primary creators',
	},
	{
		displayName: 'Date',
		name: 'date',
		type: 'string',
		default: '',
		placeholder: '2026-11-11',
		description: 'Publication date in ISO 8601 format',
	},
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		default: '',
		typeOptions: { rows: 3 },
	},
	{
		displayName: 'Identifier',
		name: 'identifier',
		type: 'string',
		default: '',
		description:
			'Unique publication identifier, such as a UUID URN or ISBN. Generated when empty.',
	},
	{
		displayName: 'Language',
		name: 'language',
		type: 'string',
		default: '',
		placeholder: 'zh-Hans',
		description: 'BCP 47 language tag. Detected from chapters when empty.',
	},
	{ displayName: 'Publisher', name: 'publisher', type: 'string', default: '' },
	{
		displayName: 'Rights',
		name: 'rights',
		type: 'string',
		default: '',
		description: 'Copyright or license statement',
	},
	{
		displayName: 'Source',
		name: 'source',
		type: 'string',
		default: '',
		description:
			'Identifier or URL of the publication from which this book is derived',
	},
	{
		displayName: 'Subject',
		name: 'subject',
		type: 'string',
		default: [],
		typeOptions: { multipleValues: true },
		description: 'Topics or keywords describing the book',
	},
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		default: '',
		description: 'Uses the file name without its extension when empty',
	},
];

export function resolveMetadata(
	input: Partial<BookMetadata>,
	chapters: { language: string }[],
	fileName: string,
): BookMetadata {
	const counts = new Map<string, number>();
	for (const chapter of chapters) {
		if (chapter.language !== 'und')
			counts.set(chapter.language, (counts.get(chapter.language) || 0) + 1);
	}
	const detected = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || 'und';
	const language = input.language?.trim()
		? normalizeLanguage(input.language)
		: detected;
	if (!language) throw new Error('Language must be a valid BCP 47 tag');
	return {
		...input,
		title: input.title?.trim() || basename(fileName).replace(/\.epub$/i, ''),
		identifier: input.identifier?.trim() || 'urn:uuid:' + randomUUID(),
		language,
	};
}
