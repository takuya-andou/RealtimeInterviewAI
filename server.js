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

// 静的ファイルを提供するミドルウェア (publicフォルダ)
// Basic認証の前に置くことで、認証なしで静的ファイルにアクセス可能にする
// 必要に応じて認証の後ろに移動してください
app.use(express.static(path.join(__dirname, 'public')));

// ルートパス ('/') で template.html を提供
app.get('/', (req, res) => {
  // Basic認証が適用された後にこのハンドラが実行される
  res.sendFile(path.join(__dirname, 'public', 'template.html'));
});


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

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
  // スプレッドシートIDは不要になったため削除
  // console.log(`スプレッドシートID: ${SPREADSHEET_ID}`);
  if (!process.env.OPENAI_API_KEY) {
      console.warn('警告: OPENAI_API_KEY 環境変数が設定されていません。');
  }
});