import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { absoluteUrls, cleanHtml, normalizeImages } from './html';
import { decodeHtml, fetchResource } from './http';
import type { Request } from './http';
import {
	declaredLanguage,
	detectLanguage,
	normalizeLanguage,
} from './language';

export async function extractArticle(request: Request, link: string) {
	let resource = await fetchResource(request, link);
	for (let refresh = 0; refresh <= 3; refresh++) {
		if (
			resource.contentType &&
			!/\b(text\/html|application\/xhtml\+xml)\b/i.test(resource.contentType)
		) {
			throw new Error(`Expected HTML, received ${resource.contentType}`);
		}
		const dom = new JSDOM(decodeHtml(resource), { url: resource.url });
		try {
			const document = dom.window.document;
			const redirect = document
				.querySelector('meta[http-equiv="refresh" i]')
				?.getAttribute('content');
			const target =
				redirect && /url\s*=\s*["']?(.*?)["']?\s*$/i.exec(redirect)?.[1];
			if (target) {
				if (refresh === 3) throw new Error('Too many HTML refresh redirects');
				resource = await fetchResource(
					request,
					new URL(target, resource.url).href,
				);
				continue;
			}
			normalizeImages(document);
			const language =
				declaredLanguage(document) ||
				normalizeLanguage(resource.language?.split(',')[0]);
			const article = new Readability(document).parse();
			if (!article?.content || !article.textContent?.trim())
				throw new Error('No article content found');
			const detectedLanguage = detectLanguage(article.textContent);
			const fragment = new JSDOM(article.content, { url: resource.url });
			try {
				absoluteUrls(fragment.window.document);
				return {
					title: article.title || '',
					content: cleanHtml(fragment.window.document.body.innerHTML),
					url: resource.url,
					originalUrl: link,
					author: article.byline || '',
					publishedAt: article.publishedTime || '',
					language:
						detectedLanguage !== 'und'
							? detectedLanguage
							: language || normalizeLanguage(article.lang) || 'und',
					siteName: article.siteName || '',
					excerpt: article.excerpt || '',
				};
			} finally {
				fragment.window.close();
			}
		} finally {
			dom.window.close();
		}
	}
	throw new Error('No article content found');
}
