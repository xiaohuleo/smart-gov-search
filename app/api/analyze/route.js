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

    // 优化后的 Prompt：强调同义词扩展和动词剔除
    const prompt = `
    你是一个政务搜索意图分析专家。用户输入: "${query}"
    
    请执行以下任务：
    1. 【核心提取】：去除“我要办”、“查询”、“怎么弄”、“在哪里”等动词和虚词，提取核心名词（例如：“我要办健康证” -> “健康证”）。
    2. 【同义词扩展】：非常重要！根据核心名词，预测政府公文中的正式叫法。
       - 例子：搜“健康证” -> 扩展出“从业人员健康检查”、“预防性健康检查”、“健康证明”。
       - 例子：搜“开店” -> 扩展出“经营许可”、“营业执照”。
    3. 【对象识别】：分析是个人业务还是企业业务。
    4. 【动作识别】：分析是办理、查询还是预约。
    
    请严格只返回JSON格式：
    {
      "keywords": ["核心名词", "正式叫法1", "正式叫法2"],
      "target": "自然人" | "法人" | "all",
      "action": "办理" | "查询" | "all"
    }
    `;

    const completion = await client.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: model || "llama3-70b-8192",
      temperature: 0.2, // 稍微提高一点创造性以生成同义词
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
