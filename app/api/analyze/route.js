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

    // 核心：基于“场景-动作”的推理
    const prompt = `
    你是一个资深的政务服务导办专员。用户会用大白话描述他的遭遇。
    请基于用户的【证照/物体】状态，推理出对应的【政府标准业务动作】。
    
    用户输入: "${query}"
    
    【核心推理逻辑】(请严格遵守):
    1. 状态="过期"、"失效"、"时间到了" -> 标准动作="到期"、"换领"、"延续"。
    2. 状态="丢了"、"不见了" -> 标准动作="遗失"、"补领"、"挂失"。
    3. 状态="坏了"、"烂了" -> 标准动作="损坏"、"换领"。
    4. 状态="开张"、"摆摊" -> 标准动作="设立"、"经营许可"。
    
    【输出要求】:
    将推理出的标准动词和核心名词放入 keywords 列表。
    
    示例 1: 输入 "身份证过期了" 
    输出: { "keywords": ["居民身份证", "身份证", "过期", "到期", "换领", "有效期"], "target": "自然人" }
    
    示例 2: 输入 "护照时间到了"
    输出: { "keywords": ["护照", "出入境", "到期", "换发", "换领"], "target": "自然人" }

    请仅返回JSON格式。
    `;

    const completion = await client.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: model || "llama3-70b-8192",
      temperature: 0.1, // 降低温度，确保推理稳定
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    return NextResponse.json(JSON.parse(content));

  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ keywords: [query], isFallback: true }, { status: 200 });
  }
}
