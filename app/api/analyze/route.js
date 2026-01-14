// app/api/analyze/route.js
import { Groq } from "groq-sdk";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    // 接收前端传来的自定义参数：baseUrl 和 model
    const { query, apiKey, baseUrl, model } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API Key" }, { status: 400 });
    }

    // 初始化客户端
    // 注意：虽然库名叫 Groq，但只要兼容 OpenAI 协议的 API (如 DeepSeek, Moonshot) 都可以通过修改 baseURL 调用
    const client = new Groq({
      apiKey: apiKey,
      baseURL: baseUrl || "https://api.groq.com/openai/v1", // 默认为 Groq
    });

    const prompt = `
    你是一个政务搜索专家。用户正在搜索政务服务。
    用户输入: "${query}"
    
    任务：
    1. 提取核心关键词。
    2. 扩展同义词（例如：用户搜"健康证"，扩展出"从业人员健康检查"、"健康证明"）。
    3. 识别目标对象（自然人/法人/全部）。
    4. 识别意图动作（查询/办理/预约/全部）。
    
    请严格只返回以下JSON格式，不要包含任何Markdown或其他文字：
    {
      "keywords": ["关键词1", "关键词2", "同义词1"],
      "target": "自然人" | "法人" | "all",
      "action": "办理" | "查询" | "all"
    }
    `;

    const completion = await client.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: model || "llama3-70b-8192", // 如果前端没传模型，默认用 Groq 的 Llama3
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("No content");

    return NextResponse.json(JSON.parse(content));

  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { 
        keywords: [], 
        target: "all", 
        action: "all",
        isFallback: true 
      }, 
      { status: 200 }
    );
  }
}
