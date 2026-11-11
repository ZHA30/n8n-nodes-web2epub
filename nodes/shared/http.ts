import type { IExecuteFunctions } from 'n8n-workflow';
import sniffEncoding from 'html-encoding-sniffer';
import iconv from 'iconv-lite';

export type Request = IExecuteFunctions['helpers']['httpRequest'];
export interface Resource {
	url: string;
	body: Buffer;
	contentType: string;
	language?: string;
}

export async function fetchResource(
	request: Request,
	source: string,
): Promise<Resource> {
	let url = new URL(source);
	for (let redirects = 0; redirects <= 10; redirects++) {
		if (!['http:', 'https:'].includes(url.protocol))
			throw new Error('Only HTTP and HTTPS URLs are supported');
		const response = (await request({
			url: url.href,
			method: 'GET',
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; Web2Epub/0.1)',
				Accept: '*/*',
			},
			encoding: 'arraybuffer',
			returnFullResponse: true,
			disableFollowRedirect: true,
			ignoreHttpStatusErrors: true,
			timeout: 30000,
		})) as {
			body: Buffer;
			headers: Record<string, string>;
			statusCode: number;
		};
		if (
			[301, 302, 303, 307, 308].includes(response.statusCode) &&
			response.headers.location
		) {
			url = new URL(response.headers.location, url);
			continue;
		}
		if (response.statusCode < 200 || response.statusCode >= 300) {
			throw new Error(`HTTP ${response.statusCode}: ${url.href}`);
		}
		return {
			url: url.href,
			body: Buffer.from(response.body),
			contentType: response.headers['content-type'] || '',
			language: response.headers['content-language'],
		};
	}
	throw new Error(`Too many redirects: ${source}`);
}

export function decodeHtml(resource: Resource): string {
	const charset = /charset\s*=\s*["']?([^\s;"']+)/i.exec(
		resource.contentType,
	)?.[1];
	return iconv.decode(
		resource.body,
		sniffEncoding(resource.body, {
			transportLayerEncodingLabel: charset,
			defaultEncoding: 'UTF-8',
		}),
	);
}
