// app/api/analyze/route.js
import { Groq } from "groq-sdk";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { query, apiKey, baseUrl, model } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API Key" }, { status: 400 });
    }

    const client = new Groq({
      apiKey: apiKey,
      baseURL: baseUrl || "https://api.groq.com/openai/v1",
    });

    const prompt = `
    你是一个搜索关键词提取专家。用户输入了口语化的政务需求，你需要将其转化为结构化的、独立的关键词列表。
    
    用户输入: "${query}"
    
    【重要规则】
    1. 必须将句子拆分为独立的【实体】（如：身份证、护照）和【动作】（如：遗失、补领、注册）。不要返回长句子。
    2. 对于口语词汇，必须提供正式的政府术语：
       - "搞丢"、"掉了" -> 必须返回 "遗失" 和 "补领"
       - "开店" -> 必须返回 "营业执照" 和 "经营许可"
       - "生娃" -> 必须返回 "生育" 和 "出生"
    
    请严格只返回以下JSON格式：
    {
      "keywords": ["实体词", "动作术语1", "动作术语2", "扩展词"],
      "target": "自然人" | "法人" | "all"
    }
    
    示例输入: "身份证搞丢了"
    示例输出: { "keywords": ["居民身份证", "身份证", "遗失", "补领", "补办", "挂失"], "target": "自然人" }
    `;

    const completion = await client.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: model || "llama3-70b-8192",
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    return NextResponse.json(JSON.parse(content));

  } catch (error) {
    console.error("API Error:", error);
    // 降级策略
    return NextResponse.json({ keywords: [query], isFallback: true }, { status: 200 });
  }
}
