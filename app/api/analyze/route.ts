// app/api/analyze/route.ts
import { Groq } from "groq-sdk";
import { NextResponse } from "next/server";

// 初始化 Groq (API Key 将从前端传过来，方便Demo演示，正式环境应在 .env)
export async function POST(req: Request) {
  try {
    const { query, apiKey, baseUrl } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API Key" }, { status: 400 });
    }

    const groq = new Groq({
      apiKey: apiKey,
      // 如果需要自定义其它兼容 OpenAI 协议的 API，可在此处配置 baseURL
      baseURL: baseUrl || "https://api.groq.com/openai/v1",
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

    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama3-70b-8192", // 使用 Groq 提供的快速模型
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("No content");

    return NextResponse.json(JSON.parse(content));

  } catch (error) {
    console.error("Groq API Error:", error);
    return NextResponse.json(
      { 
        // 降级策略：如果AI挂了，直接把用户输入当关键词
        keywords: [], 
        target: "all", 
        action: "all",
        isFallback: true 
      }, 
      { status: 200 }
    );
  }
}
