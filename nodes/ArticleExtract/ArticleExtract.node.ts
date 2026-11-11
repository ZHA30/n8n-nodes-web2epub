import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { mapConcurrent } from '../shared/concurrency';
import { extractArticle } from '../shared/article';

export class ArticleExtract implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Article Extract',
		name: 'articleExtract',
		icon: {
			light: 'file:file-text.light.svg',
			dark: 'file:file-text.dark.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle: '={{ $parameter.link }}',
		usableAsTool: true,
		description: 'Fetch a web page and extract its article content',
		defaults: { name: 'Article Extract' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		properties: [
			{
				displayName: 'Link',
				name: 'link',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'https://example.com/article',
			},
			{
				displayName: 'Concurrent Processing',
				name: 'concurrentProcessing',
				type: 'boolean',
				default: false,
				description: 'Whether to process multiple input items concurrently',
			},
			{
				displayName: 'Concurrency',
				name: 'concurrency',
				type: 'number',
				default: 3,
				typeOptions: { minValue: 1, maxValue: 10 },
				displayOptions: { show: { concurrentProcessing: [true] } },
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		if (!items.length) return [[]];
		const concurrency = this.getNodeParameter('concurrentProcessing', 0, false)
			? Math.max(
					1,
					Math.min(
						10,
						Math.floor(this.getNodeParameter('concurrency', 0, 3) as number),
					),
				)
			: 1;
		const result = await mapConcurrent(
			items,
			concurrency,
			async (item, index): Promise<INodeExecutionData> => {
				try {
					const link = this.getNodeParameter('link', index) as string;
					const article = await extractArticle(this.helpers.httpRequest, link);
					return { json: article, pairedItem: { item: index } };
				} catch (error) {
					const failure = new NodeOperationError(
						this.getNode(),
						error as Error,
						{
							itemIndex: index,
						},
					);
					if (!this.continueOnFail()) throw failure;
					return {
						json: { ...item.json, error: failure.message },
						binary: item.binary,
						error: failure,
						pairedItem: { item: index },
					};
				}
			},
		);
		return [result];
	}
}
