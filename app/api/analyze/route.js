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
    你是一个精通中国政务服务的智能助手。用户使用日常口语进行搜索，你需要将其映射为政府公文中的【标准术语领域】。

    用户输入: "${query}"

    【核心映射规则】:
    1. 【就业类】: "找工作"、"招人"、"没工作" -> 必须返回 "就业"、"招聘"、"人才"、"职业介绍"。
    2. 【证照类】: "过期"、"到期" -> 必须返回 "换领"、"延续"。
    3. 【证照类】: "丢了"、"不见了" -> 必须返回 "挂失"、"补领"。
    4. 【经营类】: "开店"、"摆摊" -> 必须返回 "经营许可"、"营业执照"。
    
    【任务】:
    去除用户输入中的虚词（如"我要"、"想"），提取核心意图，并扩展出对应的标准术语。

    示例输入: "我想找工作"
    示例输出: { "keywords": ["找工作", "就业", "招聘", "求职", "人才市场", "岗位"], "target": "自然人" }

    请严格只返回JSON格式。
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
    return NextResponse.json({ keywords: [query], isFallback: true }, { status: 200 });
  }
}
