# n8n-nodes-web2epub

Turn web articles into EPUB books with two community nodes for n8n.

> [!NOTE]
> Install `n8n-nodes-web2epub` from Community Nodes in self-hosted n8n running Node.js 24 or later.

> [!WARNING]
> Large books require filesystem or supported external binary storage in n8n and temporary disk space for images and the EPUB; pages requiring JavaScript rendering or pagination need additional processing.

## Features

Extract articles from URLs, assemble HTML chapters, and export an EPUB with embedded images and adjustable styling.

- **Article Extract**: Fetch URLs sequentially or with bounded concurrency, return readable HTML and article metadata in input order, and preserve input fields in continued-error results.
- **EPUB Create**: Write chapters and resources to temporary files, stream the EPUB to n8n binary storage, and return the book, included chapters, and failed items separately.
- **Images**: Download up to three images concurrently, convert one image at a time, deduplicate resources, and optionally omit images for a text-only book.
- **Book metadata**: Set EPUB 3 and Dublin Core fields, including series and position, with a filename-derived title, generated identifier, and detected language when omitted.
- **Typography**: Use a reflowable layout that respects reader preferences, with optional CSS overrides and a custom filename.

## References

- [Mozilla Readability](https://github.com/mozilla/readability)
- [TinyLD](https://github.com/komodojp/tinyld)
- [W3C EPUB 3.3](https://www.w3.org/TR/epub-33/)
- [Standard Ebooks Manual](https://standardebooks.org/manual/1.8.0/7-high-level-structural-patterns)
