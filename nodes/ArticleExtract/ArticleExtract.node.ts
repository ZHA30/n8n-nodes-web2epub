import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
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
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const result: INodeExecutionData[] = [];
		for (let index = 0; index < this.getInputData().length; index++) {
			const link = this.getNodeParameter('link', index) as string;
			try {
				const article = await extractArticle(this.helpers.httpRequest, link);
				result.push({ json: article, pairedItem: { item: index } });
			} catch (error) {
				const failure = new NodeOperationError(this.getNode(), error as Error, {
					itemIndex: index,
				});
				if (!this.continueOnFail()) throw failure;
				result.push({
					json: { link, error: failure.message },
					error: failure,
					pairedItem: { item: index },
				});
			}
		}
		return [result];
	}
}
