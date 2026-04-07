const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const manifestPath = path.join(__dirname, '../../webforms-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const webforms = Array.isArray(manifest.webforms) ? manifest.webforms : [];

function webformUrl(id) {
  return `/form.html?webform=${encodeURIComponent(id)}`;
}

async function clearDrafts(page) {
  await page.goto('/index.html#catalog');
  await page.evaluate(() => localStorage.removeItem('eid-wallet-forms'));
}

async function waitForEditorReady(page) {
  await expect(page.locator('#editor-container')).toBeVisible({ timeout: 120000 });
  await expect(page.locator('#loading-spinner')).toHaveClass(/d-none/, { timeout: 120000 });
}

async function clickToolbarButton(page, selector) {
  await page.locator(selector).evaluate(element => element.click());
}

async function assertArrayItemControlsPlacement(page) {
  const placementIssues = await page.evaluate(() => {
    const issues = [];
    const itemButtons = [...document.querySelectorAll('button')]
      .filter(btn =>
        btn.classList.contains('json-editor-btntype-delete') ||
        btn.classList.contains('json-editor-btntype-moveup') ||
        btn.classList.contains('json-editor-btntype-movedown')
      )
      .filter(btn =>
        !btn.classList.contains('json-editor-btntype-deleteall') &&
        !btn.classList.contains('json-editor-btntype-deletelast')
      );

    itemButtons.forEach((btn, index) => {
      const row = btn.closest('.je-array-item-row-controls');
      if (!row) {
        issues.push(`button ${index}: fuori da .je-array-item-row-controls`);
        return;
      }
      const title = row.closest('.je-object__title');
      if (!title) {
        issues.push(`button ${index}: controlli fuori da .je-object__title`);
        return;
      }

      const actionAnchor = title.querySelector(
        ':scope > .btn-group > .json-editor-btntype-editjson, :scope > .btn-group > .json-editor-btntype-properties'
      );
      if (actionAnchor) {
        const rowIsBeforeActions =
          (row.compareDocumentPosition(actionAnchor) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        if (!rowIsBeforeActions) {
          issues.push(`button ${index}: controlli item non prima di JSON/properties`);
        }
      }
    });

    return issues;
  });

  expect(
    placementIssues,
    `Controlli item non coerenti nel DOM:\n${placementIssues.join('\n')}`
  ).toEqual([]);
}

test.describe('Functional webforms coverage from manifest', () => {
  test.beforeEach(async ({ page }) => {
    await clearDrafts(page);
  });

  test('catalog renders all webforms declared in manifest', async ({ page }) => {
    await page.goto('/index.html#catalog');
    await expect(page.locator('#webforms-catalog .webform-catalog-card')).toHaveCount(webforms.length, {
      timeout: 60000
    });

    for (const webform of webforms) {
      const compileSelector = `#webforms-catalog a[href*="form.html?webform=${encodeURIComponent(webform.id)}"]`;
      await expect(page.locator(compileSelector).first()).toBeVisible();
      await expect(page.locator('#webforms-catalog')).toContainText(webform.title);
    }
  });

  test('each manifest webform opens, validates and keeps array item controls in heading', async ({ page }) => {
    for (const webform of webforms) {
      await test.step(`open and validate ${webform.id}`, async () => {
        await page.goto(webformUrl(webform.id));
        await waitForEditorReady(page);

        await clickToolbarButton(page, '#btn-validate');
        await expect(page.locator('#validation-panel-wrapper')).not.toHaveClass(/d-none/);
        await expect(page.locator('#validation-panel .callout')).toBeVisible();

        await assertArrayItemControlsPlacement(page);
      });
    }
  });

  test('save drafts for each manifest webform and verify catalog + bozze consistency', async ({ page }) => {
    const savedNames = [];

    for (const webform of webforms) {
      const draftName = `E2E ${webform.id} ${Date.now()}`;
      savedNames.push(draftName);

      await page.goto(webformUrl(webform.id));
      await waitForEditorReady(page);

      await page.fill('#form-name-input', draftName);
      await page.evaluate(() => {
        if (typeof saveCurrentForm === 'function') {
          saveCurrentForm();
        }
      });
      await expect
        .poll(async () =>
          page.evaluate(name => {
            const forms = JSON.parse(localStorage.getItem('eid-wallet-forms') || '[]');
            return forms.some(entry => entry.name === name);
          }, draftName)
        )
        .toBe(true);
      await expect(page.locator('#form-id-badge')).not.toHaveClass(/d-none/);
    }

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('eid-wallet-forms') || '[]'));
    expect(stored.length).toBe(webforms.length);
    for (const webform of webforms) {
      expect(stored.some(entry => entry.webform_id === webform.id)).toBeTruthy();
    }

    await page.goto('/index.html#bozze');
    await expect(page.locator('#view-bozze')).not.toHaveClass(/d-none/);
    await expect(page.locator('#form-list .bozza-card')).toHaveCount(webforms.length);
    for (const draftName of savedNames) {
      await expect(page.locator('#form-list')).toContainText(draftName);
    }

    await page.goto('/index.html#catalog');
    for (const webform of webforms) {
      const latestDraftLink = `#webforms-catalog a[href*="form.html?id="][href*="webform=${encodeURIComponent(webform.id)}"]`;
      await expect(page.locator(latestDraftLink).first()).toBeVisible();
    }
  });

  test('form page supports deterministic export/import JSON+CSV', async ({ page }, testInfo) => {
    const webformId = webforms[0]?.id;
    expect(webformId, 'Manifest without webforms').toBeTruthy();

    await page.goto(webformUrl(webformId));
    await waitForEditorReady(page);
    await page.fill('#form-name-input', `E2E import export ${Date.now()}`);

    await clickToolbarButton(page, '#form-export-dropdown');
    const [jsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      clickToolbarButton(page, '#btn-export-json')
    ]);
    const exportedJsonPath = testInfo.outputPath('exported-form.json');
    await jsonDownload.saveAs(exportedJsonPath);
    expect(fs.existsSync(exportedJsonPath)).toBeTruthy();

    await clickToolbarButton(page, '#form-export-dropdown');
    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      clickToolbarButton(page, '#btn-export-csv')
    ]);
    const exportedCsvPath = testInfo.outputPath('exported-form.csv');
    await csvDownload.saveAs(exportedCsvPath);
    expect(fs.existsSync(exportedCsvPath)).toBeTruthy();

    await clickToolbarButton(page, '#form-import-dropdown');
    const [jsonChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      clickToolbarButton(page, '#btn-import-json')
    ]);
    await jsonChooser.setFiles(exportedJsonPath);
    await expect(page.locator('#form-name-input')).not.toHaveValue('');

    page.once('dialog', dialog => dialog.accept());
    await clickToolbarButton(page, '#form-import-dropdown');
    const [csvChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      clickToolbarButton(page, '#btn-import-csv')
    ]);
    await csvChooser.setFiles(exportedCsvPath);
    await expect(page.locator('#form-name-input')).not.toHaveValue('');
  });

  test('bozze page supports import actions and draft card actions', async ({ page }, testInfo) => {
    await page.goto('/index.html#bozze');
    await expect(page.locator('#view-bozze')).not.toHaveClass(/d-none/);

    const jsonFixturePath = testInfo.outputPath('import-fixture.json');
    const csvFixturePath = testInfo.outputPath('import-fixture.csv');

    fs.writeFileSync(
      jsonFixturePath,
      JSON.stringify({ metadata: { nome_eaa: 'E2E JSON Draft' } }, null, 2),
      'utf8'
    );
    fs.writeFileSync(
      csvFixturePath,
      [
        'percorso;tipo_dato;valore',
        // stringa con ";": virgolette RFC 4180 sul valore
        'metadata.nome_eaa;stringa;"E2E CSV; punto e virgola nel nome"',
        ''
      ].join('\r\n'),
      'utf8'
    );

    const [jsonChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('#btn-import-json')
    ]);
    await jsonChooser.setFiles(jsonFixturePath);
    await expect(page.locator('#form-list .bozza-card')).toHaveCount(1);
    await expect(page.locator('#form-list')).toContainText('E2E JSON Draft');

    const [csvChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('#btn-import-csv')
    ]);
    await csvChooser.setFiles(csvFixturePath);
    await expect(page.locator('#form-list .bozza-card')).toHaveCount(2);
    await expect(page.locator('#form-list')).toContainText('E2E CSV; punto e virgola nel nome');

    const [jsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#form-list [data-action="export-json"]').first().click()
    ]);
    await jsonDownload.saveAs(testInfo.outputPath('bozze-export.json'));

    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#form-list [data-action="export-csv"]').first().click()
    ]);
    await csvDownload.saveAs(testInfo.outputPath('bozze-export.csv'));
  });
});
