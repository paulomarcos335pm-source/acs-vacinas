const path = require('path');
const { chromium } = require('playwright');

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l6YXWQAAAABJRU5ErkJggg==',
  'base64'
);

(async () => {
  const filePath = path.resolve(__dirname, '..', 'outputs', 'acs-vacinas-offline.html');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];

  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('file:///' + filePath.replace(/\\/g, '/'));
  await page.waitForFunction(() => window.dataSdk && document.querySelector('[data-nav="visits"]'), null, { timeout: 10000 });

  await page.evaluate(async () => {
    await window.dataSdk.create({
      type: 'patient',
      name: 'Paciente Teste Offline',
      responsible: 'Responsável Teste',
      sus_card: '999999999999999',
      birth_date: '1990-01-01',
      category: 'Adulto',
      phone: '(11) 99999-9999',
      address: 'Rua Teste, 123',
      microarea: '01',
      risk_level: 1,
      created_at: new Date().toISOString()
    });
  });

  await page.click('[data-nav="visits"]');
  await page.click('text=Nova Visita');
  await page.selectOption('select[name="patient_id"]', '999999999999999');
  await page.fill('input[name="visit_time"]', '09:30');
  await page.fill('textarea[name="observations"]', 'Registro de teste offline com imagem.');
  await page.setInputFiles('#photo-input', {
    name: 'foto-teste.png',
    mimeType: 'image/png',
    buffer: onePixelPng
  });
  await page.click('button[type="submit"]');
  await page.waitForTimeout(700);

  const result = await page.evaluate(() => {
    const visit = window.allData
      ? window.allData.find(item => item.type === 'visit' && item.patient_id === '999999999999999')
      : null;
    return {
      hasVisit: Boolean(visit),
      hasBlob: Boolean(visit && visit.photo_blob instanceof Blob),
      photoType: visit && visit.photo_type,
      statusText: document.getElementById('sync-status')?.textContent || ''
    };
  });

  await browser.close();

  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }

  if (!result.hasVisit || !result.hasBlob) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
})();
