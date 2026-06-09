const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODEL_NAME = 'gemini-2.5-flash';
const RATE_LIMIT_DELAY = 4000;

let genAI = null;
let lastRequestTime = 0;
let chatHistory = [];
const MAX_HISTORY_TURNS = 6;

const SYSTEM_PROMPT = `당신은 개인 노트 기반 AI 어시스턴트입니다.
제공된 노트 페이지 내용들을 참고하여 사용자 질문에 정확하게 답하고, 내용 정리나 요약도 도와주세요.

반드시 지켜야 할 규칙:
1. 핵심 개념, 중요 수치, 핵심 문장은 **bold** 마크다운으로 표시하세요
2. 노트 페이지에 없는 내용은 추측하지 말고 "해당 내용을 노트에서 찾지 못했습니다"라고 답하세요
3. 각 정보의 출처를 인용 번호 [1], [2] 형식으로 본문 안에 직접 삽입하세요
   예: "프로젝트 목적은 앱 통합 관리입니다 [1]. 팀원은 3명 충원되었습니다 [2]."
4. 동일 출처가 여러 번 나오면 같은 번호를 반복 사용하세요
5. 한국어로 답변하세요
6. 답변은 간결하고 명확하게 작성하세요`;

const ORGANIZE_SYSTEM_PROMPT = `당신은 노트 정리 전문가입니다. 두서없이 작성된 노트를 체계적으로 재구성하여 읽기 좋게 만들어 주세요.

반드시 지켜야 할 규칙:
1. 원래 내용의 핵심 정보를 빠짐없이 보존하세요 (임의 삭제 금지)
2. 논리적인 흐름과 주제 순서로 재구성하세요
3. 소제목은 ## 형식으로 구분하세요
4. 목록 항목은 - 불릿으로 표현하세요
5. 중요 키워드나 핵심 내용은 **굵게** 강조하세요
6. 불필요한 중복과 군더더기 표현은 제거하세요
7. 한국어로 작성하세요
8. 마크다운 형식으로만 출력하세요 (HTML 사용 금지)`;

const WEB_SEARCH_SYSTEM_PROMPT = `당신은 개인 AI 어시스턴트입니다.
웹 검색 정보와 사용자의 개인 노트를 결합하여 정확하고 최신 정보로 답변하세요.

반드시 지켜야 할 규칙:
1. 핵심 개념, 중요 수치, 핵심 문장은 **bold** 마크다운으로 표시하세요
2. 각 정보의 출처를 인용 번호 [1], [2] 형식으로 본문 안에 직접 삽입하세요
3. 개인 노트 내용이 제공된 경우 웹 정보와 함께 활용하세요
4. 한국어로 답변하세요
5. 답변은 간결하고 명확하게 작성하세요`;

function init(apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
  chatHistory = [];
}

function resetChat() {
  chatHistory = [];
}

async function queryWithFiles(question, relevantFiles, onChunk) {
  if (!genAI) throw new Error('API_NOT_INITIALIZED');

  await applyRateLimit();

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192,
      topP: 0.8,
    },
  });

  const fileContext = relevantFiles
    .map((f) => `[노트 ${f.name}]\n${f.content}`)
    .join('\n\n---\n\n');
  const userMessage = fileContext
    ? `${fileContext}\n\n질문: ${question}`
    : `질문: ${question}`;

  const trimmedHistory = chatHistory.slice(-MAX_HISTORY_TURNS);

  try {
    const chat = model.startChat({ history: trimmedHistory });
    const result = await chat.sendMessageStream(userMessage);
    let fullText = '';

    for await (const chunk of result.stream) {
      const text = chunk.text();
      fullText += text;
      if (onChunk) onChunk({ text, done: false });
    }

    chatHistory.push({ role: 'user', parts: [{ text: userMessage }] });
    chatHistory.push({ role: 'model', parts: [{ text: fullText }] });

    if (onChunk) onChunk({ text: '', done: true });
    return { fullText };
  } catch (err) {
    if (err.message?.includes('429')) throw new Error('RATE_LIMIT');
    if (err.message?.includes('API_KEY') || err.message?.includes('API key')) throw new Error('INVALID_API_KEY');
    throw err;
  }
}

async function queryWithWebSearch(question, relevantFiles, onChunk) {
  if (!genAI) throw new Error('API_NOT_INITIALIZED');

  await applyRateLimit();

  const noteContext = relevantFiles.length > 0
    ? '[내 노트 참고 자료]\n' +
      relevantFiles.map(f => `${f.name}:\n${f.content}`).join('\n\n') +
      '\n\n'
    : '';
  const userMessage = noteContext + '질문: ' + question;

  try {
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: WEB_SEARCH_SYSTEM_PROMPT,
      tools: [{ googleSearch: {} }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 8192,
      },
    });

    const result = await model.generateContentStream(userMessage);
    let fullText = '';
    let webSources = [];
    let isGrounded = false;

    for await (const chunk of result.stream) {
      const text = chunk.text();
      fullText += text;
      if (onChunk) onChunk({ text, done: false });

      const meta = chunk.candidates?.[0]?.groundingMetadata;
      if (meta) {
        if (meta.groundingSupports?.length) isGrounded = true;
        if (meta.groundingChunks?.length) {
          webSources = meta.groundingChunks
            .filter((c) => c.web?.uri)
            .map((c) => ({ title: c.web.title || c.web.uri, url: c.web.uri }));
        }
        if (meta.searchEntryPoint?.sdkBlob) {
          try {
            const pairs = JSON.parse(Buffer.from(meta.searchEntryPoint.sdkBlob, 'base64').toString('utf8'));
            if (Array.isArray(pairs) && pairs.length > 0) {
              webSources = pairs.map(([title, url]) => ({ title, url }));
            }
          } catch (_) {}
        }
      }
    }

    if (webSources.length === 0) {
      try {
        const response = await result.response;
        const meta = response.candidates?.[0]?.groundingMetadata;
        if (meta) {
          if (meta.groundingSupports?.length) isGrounded = true;
          if (meta.groundingChunks?.length) {
            webSources = meta.groundingChunks
              .filter((c) => c.web?.uri)
              .map((c) => ({ title: c.web.title || c.web.uri, url: c.web.uri }));
          }
          if (webSources.length === 0 && meta.searchEntryPoint?.sdkBlob) {
            try {
              const pairs = JSON.parse(Buffer.from(meta.searchEntryPoint.sdkBlob, 'base64').toString('utf8'));
              if (Array.isArray(pairs) && pairs.length > 0) {
                webSources = pairs.map(([title, url]) => ({ title, url }));
              }
            } catch (_) {}
          }
        }
      } catch (e) {
        console.error('[LightNote] result.response error:', e.message);
      }
    }

    if (webSources.length === 0 && isGrounded) {
      webSources = [{ title: 'Google 검색 기반 답변', url: '' }];
    }

    if (onChunk) onChunk({ text: '', done: true });
    return { fullText, webSources };
  } catch (err) {
    if (err.message?.includes('tools') || err.message?.includes('googleSearch')) {
      console.warn('웹 검색 미지원, 노트 전용으로 폴백:', err.message);
      return queryWithFiles(question, relevantFiles, onChunk);
    }
    if (err.message?.includes('429')) throw new Error('RATE_LIMIT');
    if (err.message?.includes('API_KEY') || err.message?.includes('API key')) throw new Error('INVALID_API_KEY');
    throw err;
  }
}

async function organizeContent(pageTitle, pageText, onChunk) {
  if (!genAI) throw new Error('API_NOT_INITIALIZED');

  await applyRateLimit();

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: ORGANIZE_SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192,
      topP: 0.8,
    },
  });

  const userMessage = `다음 노트를 정리해주세요.\n\n제목: ${pageTitle}\n\n내용:\n${pageText}`;

  try {
    const result = await model.generateContentStream(userMessage);
    let fullText = '';

    for await (const chunk of result.stream) {
      const text = chunk.text();
      fullText += text;
      if (onChunk) onChunk({ text, done: false });
    }

    if (onChunk) onChunk({ text: '', done: true });
    return { fullText };
  } catch (err) {
    if (err.message?.includes('429')) throw new Error('RATE_LIMIT');
    if (err.message?.includes('API_KEY') || err.message?.includes('API key')) throw new Error('INVALID_API_KEY');
    throw err;
  }
}

async function testApiKey(apiKey) {
  try {
    const testAI = new GoogleGenerativeAI(apiKey);
    const model = testAI.getGenerativeModel({ model: MODEL_NAME });
    await model.generateContent('안녕');
    return true;
  } catch {
    return false;
  }
}

async function applyRateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY) await sleep(RATE_LIMIT_DELAY - elapsed);
  lastRequestTime = Date.now();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { init, resetChat, queryWithFiles, queryWithWebSearch, organizeContent, testApiKey };
