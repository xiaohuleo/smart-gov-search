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
    你是一个政务搜索语义映射专家。
    【任务】：将用户的任何口语化需求都映射成广泛的政府服务领域关键词。
    
    用户输入: "${query}"

    【映射示例】：
    1. 用户说 "找工作"、"没工作" -> 映射为: ["就业", "招聘", "求职", "人才服务", "职业介绍", "失业登记", "档案管理", "就业援助", "见习岗位"]。
    2. 用户说 "生孩子" -> 映射为: ["生育", "出生医学证明", "落户", "计生", "准生证"]。
    3. 用户说 "摆摊"、"开店" -> 映射为: ["经营许可", "营业执照", "个体工商户"]。
    
    【要求】：
    - 不要吝啬关键词，尽可能多地列出相关联的政务术语，因为这是模糊搜索。
    - 返回结构化的JSON。

    示例输入: "我要找工作"
    示例输出: { "keywords": ["就业", "招聘", "求职", "职业", "失业", "人才", "档案"], "target": "自然人" }
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
