// src/tools/playwright.ts

/**
 * Playwright Tool
 *
 * Browser automation for web scraping, screenshots, and testing.
 * Requires playwright package: npm install playwright
 */

import { z } from 'zod';
import { logger } from '../utils/logger.js';

// Dynamically import playwright to make it optional
let playwrightModule: any = null;
let playwrightLoadAttempted = false;

async function getPlaywright(): Promise<any> {
  if (playwrightLoadAttempted) {
    return playwrightModule;
  }

  playwrightLoadAttempted = true;

  try {
    // Use Function constructor to avoid TypeScript static analysis
    const dynamicImport = new Function('modulePath', 'return import(modulePath)');
    playwrightModule = await dynamicImport('playwright');
    return playwrightModule;
  } catch (error) {
    logger.debug('Playwright not installed - browser automation unavailable');
    return null;
  }
}

// ============ Schemas ============

/**
 * Screenshot schema
 */
export const playwrightScreenshotSchema = z.object({
  url: z.string()
    .url()
    .describe("스크린샷을 캡처할 URL"),
  output_path: z.string()
    .optional()
    .describe("저장할 파일 경로 (기본: 임시 파일)"),
  full_page: z.boolean()
    .default(false)
    .optional()
    .describe("전체 페이지 캡처 (스크롤 포함)"),
  viewport_width: z.number()
    .min(320)
    .max(3840)
    .default(1280)
    .optional()
    .describe("뷰포트 너비 (기본: 1280)"),
  viewport_height: z.number()
    .min(240)
    .max(2160)
    .default(720)
    .optional()
    .describe("뷰포트 높이 (기본: 720)"),
  wait_for: z.enum(['load', 'domcontentloaded', 'networkidle'])
    .default('networkidle')
    .optional()
    .describe("대기 조건: load, domcontentloaded, networkidle"),
  timeout_ms: z.number()
    .min(1000)
    .max(60000)
    .default(30000)
    .optional()
    .describe("타임아웃 (밀리초, 기본: 30000)")
});

/**
 * Content extraction schema
 */
export const playwrightExtractSchema = z.object({
  url: z.string()
    .url()
    .describe("콘텐츠를 추출할 URL"),
  selector: z.string()
    .optional()
    .describe("CSS 선택자 (기본: body)"),
  extract_type: z.enum(['text', 'html', 'markdown', 'links', 'images'])
    .default('text')
    .optional()
    .describe("추출 타입: text, html, markdown, links, images"),
  wait_for_selector: z.string()
    .optional()
    .describe("이 선택자가 나타날 때까지 대기"),
  timeout_ms: z.number()
    .min(1000)
    .max(60000)
    .default(30000)
    .optional()
    .describe("타임아웃 (밀리초)")
});

/**
 * Interactive action schema
 */
export const playwrightActionSchema = z.object({
  url: z.string()
    .url()
    .describe("액션을 수행할 URL"),
  actions: z.array(z.object({
    type: z.enum(['click', 'fill', 'select', 'wait', 'scroll', 'press'])
      .describe("액션 타입"),
    selector: z.string()
      .optional()
      .describe("대상 요소의 CSS 선택자"),
    value: z.string()
      .optional()
      .describe("입력할 값 (fill, select, press에 사용)"),
    timeout_ms: z.number()
      .optional()
      .describe("이 액션의 타임아웃")
  })).describe("수행할 액션 목록"),
  screenshot_after: z.boolean()
    .default(false)
    .optional()
    .describe("액션 후 스크린샷 캡처")
});

/**
 * PDF generation schema
 */
export const playwrightPdfSchema = z.object({
  url: z.string()
    .url()
    .describe("PDF로 변환할 URL"),
  output_path: z.string()
    .optional()
    .describe("저장할 PDF 파일 경로"),
  format: z.enum(['A4', 'A3', 'Letter', 'Legal', 'Tabloid'])
    .default('A4')
    .optional()
    .describe("용지 크기"),
  landscape: z.boolean()
    .default(false)
    .optional()
    .describe("가로 방향"),
  print_background: z.boolean()
    .default(true)
    .optional()
    .describe("배경 포함")
});

// ============ Types ============

export type PlaywrightScreenshotParams = z.infer<typeof playwrightScreenshotSchema>;
export type PlaywrightExtractParams = z.infer<typeof playwrightExtractSchema>;
export type PlaywrightActionParams = z.infer<typeof playwrightActionSchema>;
export type PlaywrightPdfParams = z.infer<typeof playwrightPdfSchema>;

// ============ Tool Definitions ============

export const playwrightScreenshotTool = {
  name: "playwright_screenshot",
  description: `웹 페이지 스크린샷 캡처.

## 기능
- 모든 웹 페이지 스크린샷 캡처
- 전체 페이지 스크롤 캡처 지원
- 뷰포트 크기 커스터마이징

## 사용 예시
- url="https://example.com", full_page=true
- viewport_width=1920, viewport_height=1080

## 요구사항
\`npm install playwright\` 설치 필요`
};

export const playwrightExtractTool = {
  name: "playwright_extract",
  description: `웹 페이지 콘텐츠 추출.

## 기능
- 텍스트, HTML, 마크다운 추출
- 링크, 이미지 목록 추출
- CSS 선택자로 특정 영역 지정

## 사용 예시
- url="https://...", extract_type="text"
- selector="article", extract_type="markdown"

## 요구사항
\`npm install playwright\` 설치 필요`
};

export const playwrightActionTool = {
  name: "playwright_action",
  description: `웹 페이지 인터랙션.

## 기능
- 클릭, 텍스트 입력, 선택
- 스크롤, 키 입력
- 연속 액션 수행

## 사용 예시
- actions=[{type:"click", selector:"button#submit"}]
- actions=[{type:"fill", selector:"input#email", value:"test@test.com"}]

## 요구사항
\`npm install playwright\` 설치 필요`
};

export const playwrightPdfTool = {
  name: "playwright_pdf",
  description: `웹 페이지 PDF 변환.

## 기능
- 웹 페이지를 PDF로 저장
- 용지 크기, 방향 설정
- 배경 포함 여부

## 사용 예시
- url="https://...", format="A4"
- landscape=true, print_background=true

## 요구사항
\`npm install playwright\` 설치 필요`
};

// ============ Helper Functions ============

/**
 * Creates browser context with common options
 */
async function createBrowserContext(pw: any, options?: {
  viewportWidth?: number;
  viewportHeight?: number;
}) {
  const browser = await pw.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: {
      width: options?.viewportWidth || 1280,
      height: options?.viewportHeight || 720
    }
  });
  return { browser, context };
}

/**
 * Converts HTML to simple markdown
 */
function htmlToMarkdown(html: string): string {
  let md = html;

  // Headers
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');

  // Paragraphs
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

  // Links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

  // Bold and italic
  md = md.replace(/<(strong|b)[^>]*>(.*?)<\/(strong|b)>/gi, '**$2**');
  md = md.replace(/<(em|i)[^>]*>(.*?)<\/(em|i)>/gi, '*$2*');

  // Code
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
  md = md.replace(/<pre[^>]*>(.*?)<\/pre>/gis, '```\n$1\n```\n\n');

  // Lists
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<\/?[uo]l[^>]*>/gi, '\n');

  // Remove remaining tags
  md = md.replace(/<[^>]+>/g, '');

  // Clean up whitespace
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');

  return md.trim();
}

// ============ Handlers ============

export async function handlePlaywrightScreenshot(params: PlaywrightScreenshotParams) {
  const pw = await getPlaywright();

  if (!pw) {
    return {
      content: [{
        type: "text" as const,
        text: `## ❌ Playwright 미설치

Playwright가 설치되지 않았습니다.

\`\`\`bash
npm install playwright
npx playwright install chromium
\`\`\`

설치 후 다시 시도해주세요.`
      }]
    };
  }

  let browser;
  try {
    const { browser: b, context } = await createBrowserContext(pw, {
      viewportWidth: params.viewport_width,
      viewportHeight: params.viewport_height
    });
    browser = b;

    const page = await context.newPage();

    await page.goto(params.url, {
      waitUntil: params.wait_for || 'networkidle',
      timeout: params.timeout_ms || 30000
    });

    const outputPath = params.output_path ||
      `/tmp/screenshot_${Date.now()}.png`;

    await page.screenshot({
      path: outputPath,
      fullPage: params.full_page || false
    });

    await browser.close();

    return {
      content: [{
        type: "text" as const,
        text: `## ✅ 스크린샷 캡처 완료

**URL**: ${params.url}
**저장 위치**: ${outputPath}
**전체 페이지**: ${params.full_page ? '예' : '아니오'}
**뷰포트**: ${params.viewport_width || 1280}x${params.viewport_height || 720}`
      }]
    };
  } catch (error: any) {
    if (browser) await browser.close();

    logger.error({ error: error.message }, 'Playwright screenshot failed');
    return {
      content: [{
        type: "text" as const,
        text: `## ❌ 스크린샷 실패

**에러**: ${error.message}

**URL**: ${params.url}`
      }]
    };
  }
}

export async function handlePlaywrightExtract(params: PlaywrightExtractParams) {
  const pw = await getPlaywright();

  if (!pw) {
    return {
      content: [{
        type: "text" as const,
        text: `## ❌ Playwright 미설치

\`\`\`bash
npm install playwright
npx playwright install chromium
\`\`\``
      }]
    };
  }

  let browser;
  try {
    const { browser: b, context } = await createBrowserContext(pw);
    browser = b;

    const page = await context.newPage();

    await page.goto(params.url, {
      waitUntil: 'networkidle',
      timeout: params.timeout_ms || 30000
    });

    if (params.wait_for_selector) {
      await page.waitForSelector(params.wait_for_selector, {
        timeout: params.timeout_ms || 30000
      });
    }

    const selector = params.selector || 'body';
    let content: string;

    switch (params.extract_type || 'text') {
      case 'text':
        content = await page.$eval(selector, (el: Element) => el.textContent || '');
        break;

      case 'html':
        content = await page.$eval(selector, (el: Element) => el.innerHTML);
        break;

      case 'markdown':
        const html = await page.$eval(selector, (el: Element) => el.innerHTML);
        content = htmlToMarkdown(html);
        break;

      case 'links':
        const links = await page.$$eval(`${selector} a[href]`, (elements: Element[]) =>
          elements.map((el: Element) => ({
            text: el.textContent?.trim(),
            href: (el as HTMLAnchorElement).href
          }))
        );
        content = links.map((l: any) => `- [${l.text}](${l.href})`).join('\n');
        break;

      case 'images':
        const images = await page.$$eval(`${selector} img[src]`, (elements: Element[]) =>
          elements.map((el: Element) => ({
            alt: (el as HTMLImageElement).alt,
            src: (el as HTMLImageElement).src
          }))
        );
        content = images.map((i: any) => `- ![${i.alt || 'image'}](${i.src})`).join('\n');
        break;

      default:
        content = '';
    }

    await browser.close();

    // Truncate if too long
    if (content.length > 50000) {
      content = content.substring(0, 50000) + '\n\n... (truncated)';
    }

    return {
      content: [{
        type: "text" as const,
        text: `## 📄 콘텐츠 추출 완료

**URL**: ${params.url}
**선택자**: ${selector}
**타입**: ${params.extract_type || 'text'}

---

${content}`
      }]
    };
  } catch (error: any) {
    if (browser) await browser.close();

    logger.error({ error: error.message }, 'Playwright extract failed');
    return {
      content: [{
        type: "text" as const,
        text: `## ❌ 추출 실패

**에러**: ${error.message}`
      }]
    };
  }
}

export async function handlePlaywrightAction(params: PlaywrightActionParams) {
  const pw = await getPlaywright();

  if (!pw) {
    return {
      content: [{
        type: "text" as const,
        text: `## ❌ Playwright 미설치

\`\`\`bash
npm install playwright
npx playwright install chromium
\`\`\``
      }]
    };
  }

  let browser;
  try {
    const { browser: b, context } = await createBrowserContext(pw);
    browser = b;

    const page = await context.newPage();

    await page.goto(params.url, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    const results: string[] = [];

    for (const action of params.actions) {
      const timeout = action.timeout_ms || 5000;

      try {
        switch (action.type) {
          case 'click':
            if (!action.selector) throw new Error('click requires selector');
            await page.click(action.selector, { timeout });
            results.push(`✅ click: ${action.selector}`);
            break;

          case 'fill':
            if (!action.selector) throw new Error('fill requires selector');
            await page.fill(action.selector, action.value || '', { timeout });
            results.push(`✅ fill: ${action.selector} = "${action.value}"`);
            break;

          case 'select':
            if (!action.selector) throw new Error('select requires selector');
            await page.selectOption(action.selector, action.value || '', { timeout });
            results.push(`✅ select: ${action.selector} = "${action.value}"`);
            break;

          case 'wait':
            if (action.selector) {
              await page.waitForSelector(action.selector, { timeout });
              results.push(`✅ wait: ${action.selector}`);
            } else {
              await page.waitForTimeout(timeout);
              results.push(`✅ wait: ${timeout}ms`);
            }
            break;

          case 'scroll':
            if (action.selector) {
              await page.$eval(action.selector, (el: Element) => el.scrollIntoView());
              results.push(`✅ scroll: ${action.selector}`);
            } else {
              await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
              results.push(`✅ scroll: bottom`);
            }
            break;

          case 'press':
            if (!action.value) throw new Error('press requires value (key)');
            await page.keyboard.press(action.value);
            results.push(`✅ press: ${action.value}`);
            break;
        }
      } catch (actionError: any) {
        results.push(`❌ ${action.type}: ${actionError.message}`);
      }
    }

    let screenshotPath: string | undefined;
    if (params.screenshot_after) {
      screenshotPath = `/tmp/action_result_${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath });
    }

    await browser.close();

    let result = `## 🎯 액션 실행 완료

**URL**: ${params.url}

### 실행 결과
${results.join('\n')}`;

    if (screenshotPath) {
      result += `\n\n**스크린샷**: ${screenshotPath}`;
    }

    return {
      content: [{
        type: "text" as const,
        text: result
      }]
    };
  } catch (error: any) {
    if (browser) await browser.close();

    logger.error({ error: error.message }, 'Playwright action failed');
    return {
      content: [{
        type: "text" as const,
        text: `## ❌ 액션 실패

**에러**: ${error.message}`
      }]
    };
  }
}

export async function handlePlaywrightPdf(params: PlaywrightPdfParams) {
  const pw = await getPlaywright();

  if (!pw) {
    return {
      content: [{
        type: "text" as const,
        text: `## ❌ Playwright 미설치

\`\`\`bash
npm install playwright
npx playwright install chromium
\`\`\``
      }]
    };
  }

  let browser;
  try {
    const { browser: b, context } = await createBrowserContext(pw);
    browser = b;

    const page = await context.newPage();

    await page.goto(params.url, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    const outputPath = params.output_path ||
      `/tmp/page_${Date.now()}.pdf`;

    await page.pdf({
      path: outputPath,
      format: params.format || 'A4',
      landscape: params.landscape || false,
      printBackground: params.print_background ?? true
    });

    await browser.close();

    return {
      content: [{
        type: "text" as const,
        text: `## ✅ PDF 생성 완료

**URL**: ${params.url}
**저장 위치**: ${outputPath}
**용지**: ${params.format || 'A4'}
**방향**: ${params.landscape ? '가로' : '세로'}`
      }]
    };
  } catch (error: any) {
    if (browser) await browser.close();

    logger.error({ error: error.message }, 'Playwright PDF failed');
    return {
      content: [{
        type: "text" as const,
        text: `## ❌ PDF 생성 실패

**에러**: ${error.message}`
      }]
    };
  }
}

export default {
  playwrightScreenshotTool, playwrightScreenshotSchema, handlePlaywrightScreenshot,
  playwrightExtractTool, playwrightExtractSchema, handlePlaywrightExtract,
  playwrightActionTool, playwrightActionSchema, handlePlaywrightAction,
  playwrightPdfTool, playwrightPdfSchema, handlePlaywrightPdf
};
