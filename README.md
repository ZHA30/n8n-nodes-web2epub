# n8n-nodes-web2epub

Turn web articles into EPUB books with two community nodes for n8n.

> [!NOTE]
> Install `n8n-nodes-web2epub` from Community Nodes in self-hosted n8n running Node.js 24 or later.

> [!WARNING]
> Pages that require JavaScript rendering or pagination need additional processing.

## Features

Extract articles from URLs, assemble HTML chapters, and export an EPUB with embedded images and adjustable styling.

- **Article Extract**: Fetch a URL and return readable HTML, a title, language, and article metadata.
- **EPUB Create**: Combine input titles and HTML in order, with separate outputs for the book, included chapters, and failed items.
- **Images**: Embed and deduplicate images, convert unsupported formats to PNG, or omit images for a text-only book.
- **Book metadata**: Set EPUB 3.3 and Dublin Core fields, with a filename-derived title, generated identifier, and detected language when omitted.
- **Typography**: Use a reflowable layout that respects reader preferences, with optional CSS overrides and a custom filename.

## References

- [Mozilla Readability](https://github.com/mozilla/readability)
- [TinyLD](https://github.com/komodojp/tinyld)
- [W3C EPUB 3.3](https://www.w3.org/TR/epub-33/)
- [Standard Ebooks Manual](https://standardebooks.org/manual/1.8.0/7-high-level-structural-patterns)
