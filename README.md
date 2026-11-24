# AIWG

Prototypes for the AI team at Wolf Greenfield.

## FAQ

A page that answers common client questions about how the firm uses AI. Questions are grouped by topic and searchable. Each answer lists its sources and opens into a detail view. If nothing fits, readers can send a question or suggest a new FAQ.

```
npm --prefix faq install
npm --prefix faq run dev
```

Open http://localhost:5183.

### Hosting it

```
npm --prefix faq run build
```

`faq/dist/` is the whole site: upload its contents to any static host. Asset paths are relative, so it works at a domain root or in a sub-folder (`example.com/faq/`), and it needs no server rewrites. `faq/faq-site.zip` is the same folder zipped (gitignored).

Most of the answer copy is placeholder text for the demo. It needs review by the AI team before it goes in front of clients.
