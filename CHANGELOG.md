# Changelog

## 0.3.1

- Detect article language from content before using page declarations.

## 0.3.0

- Allow Creator, Contributor, and Subject fields to be removed completely.
- Store repeated metadata values as named rows. Re-enter these fields in existing workflows after upgrading.

## 0.2.0

- Stream EPUB generation through temporary files for large books.
- Limit concurrent image downloads and serialize image conversion.
- Add optional article extraction concurrency while preserving input order.
- Preserve input fields and binary attachments in continued extraction errors.
- Add EPUB series names and positions to book metadata.

## 0.1.1

- Generate styles before linting a fresh checkout.
- Configure CI and npm Trusted Publishing with provenance.

## 0.1.0

- Extract readable articles and identify their language.
- Create EPUB books with Dublin Core metadata, embedded images, and custom CSS.
- Return the book, successful chapters, and failed items on separate outputs.
