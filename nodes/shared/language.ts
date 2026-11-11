import { detect } from 'tinyld';

export function normalizeLanguage(
	value: string | null | undefined,
): string | undefined {
	const tag = value?.trim().replace(/_/g, '-');
	if (!tag) return undefined;
	try {
		return Intl.getCanonicalLocales(tag)[0];
	} catch {
		return undefined;
	}
}

export function detectLanguage(text: string): string {
	return detect(text) || 'und';
}

export function declaredLanguage(document: Document): string | undefined {
	const values = [
		document.documentElement.getAttribute('lang'),
		document.documentElement.getAttribute('xml:lang'),
		document
			.querySelector('meta[http-equiv="content-language" i]')
			?.getAttribute('content'),
		document.querySelector('meta[name="language" i]')?.getAttribute('content'),
		document
			.querySelector('meta[property="og:locale" i]')
			?.getAttribute('content'),
	];
	for (const value of values) {
		const language = normalizeLanguage(value?.split(',')[0]);
		if (language) return language;
	}
	return undefined;
}
