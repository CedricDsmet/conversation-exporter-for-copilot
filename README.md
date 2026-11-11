# Conversation Exporter for Copilot

A small Chrome / Edge extension that saves the Copilot conversation you have open
as a structured file (headings, lists, tables, code and formulas are kept), so
you can email it instead of pasting it into Word.

Nothing is uploaded anywhere. The extension only reads the Copilot tab you are
looking at, and only when you click it.

Privacy policy: https://cedricdsmet.github.io/conversation-exporter-for-copilot/privacy-policy.html

## Install (once, about 1 minute)

1. On this page, click **Code → Download ZIP** and unzip it. Inside is a folder
   called `extension`. Put it somewhere it can stay (for example Documents).
   Do not delete it afterwards.
2. In Chrome, open `chrome://extensions` (in Edge: `edge://extensions`).
3. Switch on **Developer mode** (top right in Chrome, left side in Edge).
4. Click **Load unpacked** and select the `extension` folder.
5. Click the puzzle-piece icon in the toolbar and pin
   **Conversation Exporter for Copilot** so it is always visible.

## Use

1. Open the conversation in Copilot (copilot.com).
2. Click the extension icon.
3. Choose one:
   - **Download as web page (.html)**: nicest to read, opens in any browser.
   - **Download as Markdown (.md)**: plain text with structure.
   - **Copy as Markdown**: paste straight into an email or chat.
4. Keep the popup open for the few seconds it takes. The page scrolls through
   the conversation by itself, that is normal. The file lands in Downloads.
5. Attach the file to an email.

## Good to know

- Wait until Copilot has finished answering before exporting.
- Diagrams (Mermaid) are included: as a picture in the web page export, and as
  diagram source in the Markdown export.
- Pictures in the conversation are embedded in the file where the browser allows
  it. Files you uploaded and files Copilot created are not included, only links
  to them.
- After updating to a new version of the extension, open `chrome://extensions`
  and click the reload arrow on the extension.
- If "Load unpacked" is greyed out or blocked, your organisation does not allow
  manually installed extensions. Let us know and we will find another route.

## Repository layout

- `extension/`: the extension itself (load this folder unpacked, or zip it for the stores).
- `store/`: Chrome Web Store and Edge Add-ons listing text (`LISTING.md`), images and their sources.
- `docs/`: the GitHub Pages site with the privacy policy.

## Contact

Cedric De Smet · cedric.de.smet@outlook.com

Microsoft and Copilot are trademarks of the Microsoft group of companies. This
project is not affiliated with or endorsed by Microsoft.
