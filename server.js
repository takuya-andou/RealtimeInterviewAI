import express from 'express';
import fetch from 'node-fetch';
import { config } from 'dotenv';
import basicAuth from 'express-basic-auth';
import path from 'path'; // path モジュールをインポート
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// __dirname を ESM で利用可能にする
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config(); // .env ファイルを読み込む

const app = express();
const PORT = process.env.PORT || 3000;

// JSONボディをパースできるようにする
app.use(express.json());

// --- Basic認証 ---
// 環境変数で認証情報が設定されている場合のみ適用
if (process.env.DEFAULT_AUTH_USER && process.env.DEFAULT_AUTH_PASS) {
  console.log("Basic認証を有効にします。");
  app.use(basicAuth({
    users: {
      [process.env.DEFAULT_AUTH_USER]: process.env.DEFAULT_AUTH_PASS
    },
    challenge: true, // 認証ダイアログを表示
    unauthorizedResponse: () => 'Authentication required.' // 認証失敗時のメッセージ
  }));
} else {
    console.log("Basic認証は無効です。DEFAULT_AUTH_USER と DEFAULT_AUTH_PASS が設定されていません。");
}

// 静的ファイルを提供するミドルウェア (publicフォルダ)
app.use(express.static(path.join(__dirname, 'public')));

// エフェメラルキーを取得するエンドポイント
app.post('/session', async (req, res) => {
  try {
    const { instructions, voice, model } = req.body;

    // モデルや音声が指定されていない場合のデフォルト値
    const selectedModel = model || 'gpt-4o-mini-realtime-preview-2024-12-17'; // デフォルトモデル
    const selectedVoice = voice || 'alloy'; // デフォルト音声
    const defaultInstructions = 'You are a helpful AI assistant.'; // デフォルト指示

    console.log(`Session requested with: Model=${selectedModel}, Voice=${selectedVoice}`);
    console.log(`Instructions: ${instructions || defaultInstructions}`);


    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel,
        voice: selectedVoice,
        instructions: instructions || defaultInstructions, // instructionsが空ならデフォルトを使用
        input_audio_transcription: {
          model: "whisper-1"
        }
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API Error:', errorData); // エラーログを追加
      return res.status(response.status).send({ error: `OpenAI API Error: ${errorData}` });
    }

    const data = await response.json();
    res.send(data);
  } catch (error) {
    console.error('Error fetching ephemeral key:', error); // エラーログを修正
    res.status(500).send({ error: 'Internal Server Error' });
  }
});

// ルートパス ('/') で template.html を提供
app.get('/', (req, res) => {
  // Basic認証が適用された後にこのハンドラが実行される
  res.sendFile(path.join(__dirname, 'public', 'template.html'));
});

// --- New Summarization Endpoint ---
app.post('/summarize', async (req, res) => {
  const { transcript, hearingItems } = req.body; // Added hearingItems

  if (!transcript) {
    return res.status(400).json({ error: 'Transcript is required.' });
  }
  // hearingItems are optional, but we'll use a default prompt part if missing
  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY is not set.');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  console.log('Summarization request received.');
  // console.log('Hearing Items:', hearingItems); // Optional: Log received items

  try {
    // Construct prompt using hearing items if provided
    let systemPrompt = 'You are a helpful assistant that summarizes conversations.';
    let userPrompt = `以下の会話を要約してください:\n\n${transcript}`;
    console.log('Hearing Items:', hearingItems);
    console.log('Transcript:', transcript);
    if (hearingItems) {
      systemPrompt = `You are an assistant that summarizes conversations, focusing on extracting information related to specific items.`;
      userPrompt = `# 指示:以下の会話内容について、下記のヒアリング項目に沿って情報を抽出してください。\n\n# 注意:前置きなどは不要です。ヒヤリング項目だけを抽出してください。\n文字起こしは不完全で欠損している可能性があります。\n文字起こしの順番は会話の順番に沿っているとは限らず前後していることが多いです。応答を見て会話の流れを読み取ってください。\n\n# ヒアリング項目:\n${hearingItems}\n\n# 会話内容:\n${transcript}`;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o', // Use gpt-4o model
        messages: [
          { role: 'system', content: systemPrompt }, // Use dynamic system prompt
          { role: 'user', content: userPrompt } // Use dynamic user prompt
        ],
        max_tokens: 500, // Adjust as needed
        temperature: 0.5, // Adjust as needed
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI Summarization API Error:', errorData);
      throw new Error(`OpenAI API Error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const summaryText = data.choices?.[0]?.message?.content?.trim();

    if (!summaryText) {
      console.error('No summary content received from OpenAI:', data);
      throw new Error('Failed to extract summary from OpenAI response.');
    }

    console.log('Summarization successful.');
    res.json({ summary: summaryText });

  } catch (error) {
    console.error('Error during summarization:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error during summarization.' });
  }
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
  // スプレッドシートIDは不要になったため削除
  // console.log(`スプレッドシートID: ${SPREADSHEET_ID}`);
  if (!process.env.OPENAI_API_KEY) {
      console.warn('警告: OPENAI_API_KEY 環境変数が設定されていません。');
  }
});
