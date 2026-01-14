import { Groq } from "groq-sdk";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const { query, apiKey, customBaseUrl, customModel } = await req.json();

    if (!query) return NextResponse.json({ error: "请输入搜索内容" }, { status: 400 });
    if (!apiKey) return NextResponse.json({ error: "请配置 Groq API Key" }, { status: 401 });

    const groq = new Groq({ apiKey, baseURL: customBaseUrl });

    // 核心优化：让 AI 扩展关键词，以匹配政务服务的官方名称
    const systemPrompt = `
      你是一个中国政务服务搜索意图分析专家。你的任务是将用户的口语化需求转换为标准的政务服务关键词。
      
      请分析用户输入，返回一个 JSON 对象（严禁包含 Markdown 格式）：
      {
        "keywords": ["核心词1", "核心词2", "同义词1", "同义词2"], 
        "location": "城市名" | "null", // 如果用户提到了具体的湖南省内城市（如长沙、怀化、邵阳等）
        "role": "自然人" | "法人" | "null"
      }

      示例 1:
      用户: "我要给小孩打针"
      返回: { "keywords": ["疫苗", "接种", "免疫", "预防接种"], "location": "null", "role": "自然人" }

      示例 2:
      用户: "怀化的房子怎么查"
      返回: { "keywords": ["不动产", "房产", "楼盘", "二手房", "网签"], "location": "怀化", "role": "自然人" }
      
      示例 3:
      用户: "公司营业执照丢了"
      返回: { "keywords": ["营业执照", "补领", "换发", "遗失"], "location": "null", "role": "法人" }
    `;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      model: customModel || "llama3-70b-8192",
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const content = chatCompletion.choices[0]?.message?.content;
    const intentData = JSON.parse(content || "{}");
    return NextResponse.json(intentData);

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
