import { Groq } from "groq-sdk";
import { NextResponse } from "next/server";

// 强制动态模式，避免缓存
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const { query, apiKey, customBaseUrl, customModel } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "请输入搜索内容" }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: "请配置 Groq API Key" }, { status: 401 });
    }

    // 配置 Groq 客户端
    const clientConfig = {
      apiKey: apiKey,
    };
    // 如果有自定义地址（兼容其他 OpenAI 格式的 API）
    if (customBaseUrl) {
      clientConfig.baseURL = customBaseUrl;
    }

    const groq = new Groq(clientConfig);

    const systemPrompt = `
      你是一个政务搜索意图分析专家。请分析用户的搜索内容，提取关键信息并以 JSON 格式返回。
      
      用户输入可能包含：办理事项、地点、身份暗示等。
      
      请返回如下 JSON 结构（不要返回任何 Markdown 标记）：
      {
        "keywords": ["关键词1", "关键词2"], // 提取核心动词和名词
        "implied_role": "自然人" | "法人" | "null", // 如果用户说"我要开公司"暗示是法人，"我的公积金"暗示自然人
        "implied_location": "城市名" | "null", // 如果用户提到具体地点
        "category_intent": "分类意图" // 如：公安、税务、社保等
      }
    `;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      model: customModel || "llama3-70b-8192", // 默认使用 Llama3
      temperature: 0.1, // 低随机性，保证精准
      response_format: { type: "json_object" },
    });

    const intentData = JSON.parse(chatCompletion.choices[0]?.message?.content || "{}");
    return NextResponse.json(intentData);

  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
