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
	series?: string;
	seriesPosition?: number;
}

type TextList = { entries?: { value: string }[] };
export type BookMetadataInput = Omit<
	Partial<BookMetadata>,
	'creator' | 'contributor' | 'subject'
> & {
	creator?: TextList;
	contributor?: TextList;
	subject?: TextList;
};

function textList(
	displayName: string,
	name: string,
	description: string,
): INodeProperties {
	return {
		displayName,
		name,
		description,
		type: 'fixedCollection',
		default: {},
		typeOptions: { multipleValues: true },
		placeholder: `Add ${displayName}`,
		options: [
			{
				displayName,
				name: 'entries',
				values: [
					{ displayName: 'Value', name: 'value', type: 'string', default: '' },
				],
			},
		],
	};
}

export const bookMetadataFields: INodeProperties[] = [
	textList(
		'Contributor',
		'contributor',
		'People or organizations contributing to the book',
	),
	textList('Creator', 'creator', 'Authors or other primary creators'),
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
	{ displayName: 'Series', name: 'series', type: 'string', default: '' },
	{
		displayName: 'Series Position',
		name: 'seriesPosition',
		type: 'number',
		default: 1,
		typeOptions: { minValue: 0, numberPrecision: 2 },
		description: 'Position within the series, including fractional volumes',
	},
	{
		displayName: 'Source',
		name: 'source',
		type: 'string',
		default: '',
		description:
			'Identifier or URL of the publication from which this book is derived',
	},
	textList('Subject', 'subject', 'Topics or keywords describing the book'),
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		default: '',
		description: 'Uses the file name without its extension when empty',
	},
];

export function resolveMetadata(
	input: BookMetadataInput,
	chapters: { language: string }[],
	fileName: string,
): BookMetadata {
	if (input.seriesPosition !== undefined && !input.series?.trim())
		throw new Error('Series is required when Series Position is set');
	if (
		input.seriesPosition !== undefined &&
		(!Number.isFinite(input.seriesPosition) || input.seriesPosition < 0)
	)
		throw new Error('Series Position must be a non-negative number');
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
	const list = (value?: TextList): string[] | undefined => {
		if (value === undefined) return undefined;
		return (value.entries || [])
			.map((entry) => entry.value)
			.filter((entry) => entry.trim());
	};
	return {
		...input,
		creator: list(input.creator),
		contributor: list(input.contributor),
		subject: list(input.subject),
		title: input.title?.trim() || basename(fileName).replace(/\.epub$/i, ''),
		identifier: input.identifier?.trim() || 'urn:uuid:' + randomUUID(),
		language,
	};
}
