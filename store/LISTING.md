# Store listing: Conversation Exporter for Copilot

Everything to paste into the Chrome Web Store and Microsoft Edge Add-ons forms.
- **Publisher:** Cedric De Smet
- **Support email:** cedric.de.smet@outlook.com
- **Source code:** https://github.com/CedricDsmet/conversation-exporter-for-copilot
- **Privacy policy:** https://cedricdsmet.github.io/conversation-exporter-for-copilot/privacy-policy.html

## Files to upload

| What | File | Store |
|---|---|---|
| Extension package | `store/conversation-exporter-for-copilot-1.0.0.zip` | Both |
| Store icon 128×128 | `store/images/chrome-store-icon-128x128.png` | Chrome |
| Logo 300×300 | `store/images/edge-logo-300x300.png` | Edge |
| Screenshots 1280×800 | `store/images/screenshot-1-popup.png`, `screenshot-2-html.png`, `screenshot-3-markdown.png` | Both |
| Small promo tile 440×280 | `store/images/promo-small-440x280.png` | Both (Chrome: required) |
| Marquee / large promo 1400×560 | `store/images/promo-marquee-1400x560.png` | Both (optional) |
| Privacy policy | `docs/privacy-policy.html`, hosted at `https://cedricdsmet.github.io/conversation-exporter-for-copilot/privacy-policy.html` | Both |

---

## Basic details

**Name**
Conversation Exporter for Copilot

**Summary / short description** (Chrome max 132 characters; this is also the manifest description)
Save the open Microsoft Copilot chat as a structured HTML or Markdown file. Runs only when you click it. Nothing is uploaded.

**Category**
- Chrome: Productivity → Tools (or "Workflow & Planning")
- Edge: Productivity

**Language**
English

### Detailed description

Paste this into both stores:

```
Copying a long Copilot answer into Word or an email usually breaks it: tables fall apart, code loses its formatting and formulas turn into gibberish. Conversation Exporter for Copilot saves the whole conversation you have open as one clean file you can attach, archive or reuse.

HOW IT WORKS
1. Open a conversation in Microsoft Copilot.
2. Click the extension icon.
3. Pick a format. The extension scrolls through the conversation by itself, so long chats are captured completely, and then saves the file to your Downloads folder.

THREE WAYS TO EXPORT
• Web page (.html): nicest to read, opens in any browser, prints well. Good for attaching to an email.
• Markdown (.md): plain text with structure, ideal for notes apps, wikis, Git or feeding into other tools.
• Copy as Markdown: put the conversation on your clipboard and paste it straight into an email or chat.

WHAT IS KEPT
• Your questions and Copilot's answers, clearly labelled
• Headings, bold and italic text, lists and links
• Tables
• Code blocks, including the language
• Math formulas (as LaTeX in Markdown, rendered in HTML)
• Diagrams, with their source code
• Images and charts, embedded in the file so they still show after the original links expire

PRIVATE BY DESIGN
• Works only on the tab you are looking at, and only when you click the icon.
• The conversation is processed entirely in your browser. Nothing is sent to us or to any other server.
• No account, no tracking, no analytics, no ads.
• Uses only two permissions: "activeTab" and "scripting". It cannot read any of your other tabs or browsing history.

This extension is an independent tool and is not affiliated with, endorsed by or sponsored by Microsoft. Microsoft and Copilot are trademarks of the Microsoft group of companies.
```

---

## Privacy practices (Chrome "Privacy" tab / Edge "Properties")

### Single purpose (Chrome)

```
Export the Microsoft Copilot conversation that is open in the current tab to a file (HTML or Markdown) or to the clipboard, when the user clicks the extension.
```

### Permission justifications

**activeTab**
```
Needed to access the Copilot tab the user is looking at, only at the moment the user clicks the extension's toolbar button. This lets the extension read the conversation on that page without requesting access to any website in advance or to any other tab.
```

**scripting**
```
Used to run the exporter script in the active Copilot tab after the user clicks an export button. The script reads the conversation from the page (scrolling through it so long conversations are complete), converts it to HTML or Markdown, and hands the result back to the popup, which saves it as a download or copies it to the clipboard. The script is bundled with the extension; no remote code is loaded.
```

**Remote code**
Select: **No, I am not using remote code.**
```
All JavaScript is included in the extension package. No external scripts, eval of fetched code or WebAssembly from remote sources.
```

### Data usage disclosure (Chrome checkboxes)

**What user data do you plan to collect?** Tick **none**. The conversation is read and converted locally, and the result goes only to the user's own Downloads folder or clipboard. It is never transmitted to the developer or any third party, so under the Chrome Web Store definition nothing is "collected".

Tick all three certifications:
- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**: `https://cedricdsmet.github.io/conversation-exporter-for-copilot/privacy-policy.html`

### Edge

- **Privacy policy required?** Answer "Yes" and enter `https://cedricdsmet.github.io/conversation-exporter-for-copilot/privacy-policy.html`. It isn't strictly required when no personal data is collected, but having one speeds up review.
- **Website**: optional. Use the repo or company page.
- **Support contact**: `cedric.de.smet@outlook.com`
- **Mature content**: No

---

## Notes for reviewers / certification

Paste this into Chrome's "Test instructions" field and Edge's "Notes for certification":

```
This extension only does something on a Microsoft Copilot conversation page (e.g. https://m365.cloud.microsoft/chat or https://copilot.microsoft.com). A Microsoft account is needed to open Copilot; any free personal Microsoft account works.

To test:
1. Sign in to Copilot and start or open a conversation with a few messages (ask for a table and a code sample to see the formatting).
2. Click the extension's toolbar icon.
3. Click "Download as web page (.html)". The page scrolls through the conversation briefly; then an .html file is saved to Downloads. Open it to see the conversation.
4. "Download as Markdown (.md)" and "Copy as Markdown" do the same with Markdown output.

On any non-Copilot page the popup shows "No conversation found".

Privacy: the extension makes no network requests of its own except re-fetching images that are already shown in the conversation (same URLs the page itself uses), so they can be embedded in the exported file. No data leaves the browser.
```

---

## Distribution

- **Visibility**:
  - **Public**: anyone can find it in the store.
  - **Unlisted**: only people with the link can install it. Good for colleagues.
  - **Private**: Chrome only, limited to your Google Workspace domain or trusted testers.
- **Regions**: All regions
- **Pricing**: Free

---

## Developer account checklist

**Chrome Web Store** (https://chrome.google.com/webstore/devconsole)
- One-time $5 registration fee.
- 2-step verification must be on for the Google account.
- Verify the contact email, and set the publisher name to `Cedric De Smet`.
- For a company, consider a Google Group publisher so several people can manage it.

**Microsoft Edge Add-ons** (https://partner.microsoft.com/dashboard/microsoftedge)
- Free.
- Register as an Individual or Company developer. A company account requires a short verification step.

---

## Updating later

1. Bump `"version"` in `extension/manifest.json` (e.g. 1.0.1).
2. Rebuild the zip:
   ```bash
   cd extension && zip -r -X ../store/conversation-exporter-for-copilot-1.0.1.zip . -x '.*'
   ```
3. Upload the new zip in each dashboard ("Package → Upload new package" / "Update") and submit for review.
