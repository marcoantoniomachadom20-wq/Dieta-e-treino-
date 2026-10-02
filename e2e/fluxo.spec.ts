import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
};

test('fluxo diário completo no celular', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Cadastro
  await page.goto('/');
  await page.getByRole('tab', { name: 'Criar conta' }).click();
  await page.getByLabel('Nome').fill('Atleta');
  await page.getByLabel('E-mail').fill(`e2e${Date.now()}@teste.com`);
  await page.getByLabel('Senha').fill('senha-forte-123');
  await shot(page, '00-cadastro');
  await page.getByRole('button', { name: 'Criar conta' }).click();

  // Check-in matinal abre sozinho
  await expect(page.getByText('Bom dia. Como você dormiu?')).toBeVisible();
  await page.getByPlaceholder('ex.: 7,5').fill('7,5');
  const scales = page.locator('.scale');
  await scales.nth(0).getByRole('button', { name: '4' }).click();
  await scales.nth(1).getByRole('button', { name: '4' }).click();
  await shot(page, '01-checkin');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.locator('.scale').nth(0).getByRole('button', { name: '2' }).click();
  await page.locator('.scale').nth(1).getByRole('button', { name: '2' }).click();
  await page.locator('.scale').nth(2).getByRole('button', { name: '4' }).click();
  await page.getByRole('button', { name: 'Ver recomendação' }).click();
  await expect(page.getByText('Status de recuperação')).toBeVisible();
  await shot(page, '02-checkin-resultado');
  await page.getByRole('button', { name: 'Entendi' }).click();

  // Dashboard
  await expect(page.getByText('2.350 kcal').first()).toBeVisible();
  await shot(page, '03-dashboard');

  // Dieta: adicionar pela biblioteca
  await page.getByRole('link', { name: 'Dieta' }).click();
  await page.getByRole('button', { name: 'Adicionar alimento' }).click();
  await page.getByPlaceholder('Buscar alimento').fill('frango');
  await page.getByText('Peito de frango grelhado').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Adicionar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
  await expect(page.getByText('Peito de frango grelhado')).toBeVisible();
  await expect(page.getByText(/kcal restantes/)).toBeVisible();
  // proteína: 150 g de frango = 48 g → faltam 112 g
  await expect(page.getByText('faltam 112')).toBeVisible();
  await page.getByRole('button', { name: '+500' }).click();
  await expect(page.getByText('500 / ')).toBeVisible();
  // Foto sem IA configurada → mensagem clara
  await page.getByRole('button', { name: 'Fotografar refeição' }).click();
  await expect(page.getByText(/não configurada/)).toBeVisible();
  await shot(page, '04-dieta');

  // Gasto energético
  await page.getByRole('tab', { name: 'Gasto' }).click();
  await page.getByLabel('Calorias ativas').fill('680');
  await page.getByLabel('Calorias totais').fill('2850');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('~2.850').first()).toBeVisible();
  await shot(page, '05-gasto');

  // Treinos: criar musculação avulsa hoje e registrar
  await page.getByRole('link', { name: 'Treinos' }).click();
  await expect(page.getByRole('button', { name: 'Registrar atividade avulsa' })).toBeVisible();
  await shot(page, '06-treino-hoje');
  const cont = page.getByRole('button', { name: 'Iniciar treino' });
  if (await cont.count()) {
    await cont.first().click();
  } else {
    await page.getByRole('button', { name: 'Registrar atividade avulsa' }).click();
    await page.getByRole('tab', { name: 'Musculação' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Criar' }).click();
    await page.getByRole('button', { name: 'Iniciar treino' }).click();
  }
  await expect(page.getByText('séries').first()).toBeVisible();
  await page.getByLabel('Carga série 1').first().fill('60');
  await page.getByLabel('Repetições série 1').first().fill('10');
  await page.getByLabel('Repetições série 1').first().blur();
  await page.getByRole('button', { name: 'Concluir série' }).first().click();
  await page.getByRole('button', { name: 'Concluir série' }).first().click();
  await shot(page, '07-treino-ativo');
  await page.getByRole('button', { name: 'Concluir treino' }).click();
  await page.locator('.sheet .scale').first().getByRole('button', { name: '7' }).click();
  await shot(page, '08-rpe');
  await page.getByRole('button', { name: /Concluir musculação/ }).click();
  await expect(page.getByText('Volume').first()).toBeVisible();
  await shot(page, '09-treino-concluido');

  // Semana e histórico
  await page.goto('/treinos?tab=semana');
  await expect(page.getByText(/Replanejar|Descanso/).first()).toBeVisible();
  await shot(page, '10-semana');
  await page.goto('/treinos?tab=historico');
  await expect(page.getByText('Treinos realizados')).toBeVisible();
  await shot(page, '11-historico');

  // Evolução: peso
  await page.getByRole('link', { name: 'Evolução' }).click();
  await page.getByLabel('Peso (kg)').fill('74,6');
  await page.getByRole('button', { name: 'Registrar peso' }).click();
  await expect(page.getByText('74,6 kg').first()).toBeVisible();
  await shot(page, '12-peso');

  // Medidas
  await page.getByRole('tab', { name: 'Medidas' }).click();
  await page.getByLabel('Cintura (cm)').fill('82');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText(/Cintura 82/)).toBeVisible();

  // Fotos
  await page.getByRole('tab', { name: 'Fotos' }).click();
  await page.locator('input[type=file]').setInputFiles(path.join(path.dirname(new URL(import.meta.url).pathname), 'fixture.png'));
  await expect(page.locator('img[alt^="frontal"]')).toBeVisible();
  await shot(page, '13-fotos');

  // Performance
  await page.getByRole('link', { name: 'Performance' }).click();
  await shot(page, '14-performance');
  await page.getByRole('tab', { name: 'Semana' }).click();
  await expect(page.getByText('RESUMO', { exact: true })).toBeVisible();
  await shot(page, '15-relatorio');
  await page.getByRole('tab', { name: 'Metas' }).click();
  await expect(page.getByText('Treinar musculação 3x na semana')).toBeVisible();
  await shot(page, '16-metas');

  // Perfil
  await page.goto('/perfil');
  await expect(page.getByText('Metas nutricionais')).toBeVisible();
  await shot(page, '17-perfil');

  // Dashboard final reflete os registros
  await page.goto('/');
  await expect(page.getByText(/Musculação na semana/)).toBeVisible();
  await shot(page, '18-dashboard-final');

  // Sem rolagem horizontal no celular
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Persistência: recarregar mantém sessão e dados
  await page.reload();
  await page.goto('/dieta');
  await expect(page.getByText('Peito de frango grelhado')).toBeVisible();

  expect(errors).toEqual([]);
});
