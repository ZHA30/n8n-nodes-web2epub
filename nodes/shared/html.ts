import { JSDOM } from 'jsdom';
import sanitizeHtml from 'sanitize-html';

export function cleanHtml(html: string): string {
	return sanitizeHtml(html, {
		allowedTags: [
			...sanitizeHtml.defaults.allowedTags,
			'img',
			'figure',
			'figcaption',
			'main',
			'section',
			'article',
			'mark',
			'ruby',
			'rt',
			'rp',
			'del',
			'ins',
			'sub',
			'sup',
		],
		allowedAttributes: {
			'*': ['id', 'class', 'lang', 'dir'],
			a: ['href', 'title'],
			img: ['src', 'alt', 'title', 'width', 'height'],
			td: ['colspan', 'rowspan'],
			th: ['colspan', 'rowspan', 'scope'],
			ol: ['start', 'reversed'],
			li: ['value'],
		},
		allowedSchemes: ['http', 'https', 'mailto'],
		allowedSchemesByTag: { img: ['http', 'https', 'data'] },
	});
}

export function normalizeImages(document: Document): void {
	for (const picture of document.querySelectorAll('picture')) {
		const image = picture.querySelector('img');
		const source = picture.querySelector('source[srcset]');
		if (image && !image.getAttribute('src') && source)
			image.setAttribute('srcset', source.getAttribute('srcset')!);
	}
	for (const image of document.querySelectorAll('img')) {
		const lazy =
			image.getAttribute('data-src') ||
			image.getAttribute('data-original') ||
			image.getAttribute('data-lazy-src');
		const srcset =
			image.getAttribute('data-srcset') || image.getAttribute('srcset');
		if (lazy) image.setAttribute('src', lazy);
		else if (srcset) {
			const candidates = srcset.split(',').map((part) => {
				const [url, descriptor = '1'] = part.trim().split(/\s+/);
				return { url, size: parseFloat(descriptor) };
			});
			candidates.sort((a, b) => b.size - a.size);
			if (candidates[0]) image.setAttribute('src', candidates[0].url);
		}
		image.removeAttribute('srcset');
		image.removeAttribute('sizes');
	}
}

export function absoluteUrls(document: Document): void {
	for (const element of document.querySelectorAll('a[href], img[src]')) {
		const attribute = element.tagName === 'A' ? 'href' : 'src';
		const value = element.getAttribute(attribute)!;
		if (value.startsWith('#')) continue;
		element.setAttribute(attribute, new URL(value, document.baseURI).href);
	}
}

export function fragmentDom(html: string): JSDOM {
	const dom = new JSDOM('');
	dom.window.document.body.innerHTML = html;
	return dom;
}

export function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}
