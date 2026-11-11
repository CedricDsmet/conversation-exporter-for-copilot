const statusEl = document.getElementById('status');
const buttons = [...document.querySelectorAll('button')];

function setStatus(text, kind = '') {
  statusEl.textContent = text;
  statusEl.className = kind;
}

async function run(format) {
  buttons.forEach((b) => (b.disabled = true));
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // activeTab exposes the URL of the tab the user clicked on. Browser pages, the store and
    // local files can't be scripted, so say so plainly instead of showing a raw error.
    if (!tab || (tab.url && !/^https:\/\//i.test(tab.url))) {
      setStatus('This tab is not a Copilot chat. Open the conversation in Copilot and try again.', 'error');
      return;
    }
    setStatus(
      format === 'copy'
        ? 'Reading the conversation… keep this popup open.'
        : 'Reading the conversation… the file is saved to Downloads when it is done.'
    );
    // Runs in the page's own context so it can read the original source of code blocks and diagrams.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['exporter.js'] });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: (f) => window.__copilotExport(f),
      args: [format],
    });
    if (!result || !result.count) {
      setStatus('No conversation found. Open a Copilot chat in this tab and try again.', 'error');
      return;
    }
    if (format === 'copy') {
      await navigator.clipboard.writeText(result.markdown);
      setStatus(`Copied ${result.count} messages to the clipboard.`, 'ok');
    } else {
      setStatus(`Saved ${result.count} messages to your Downloads folder.`, 'ok');
    }
  } catch (err) {
    setStatus(`Could not export from this page. Is a Copilot chat open in this tab? (${err.message})`, 'error');
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

buttons.forEach((b) => b.addEventListener('click', () => run(b.dataset.format)));
