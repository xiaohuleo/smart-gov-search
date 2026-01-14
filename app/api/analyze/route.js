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

    // --- 核心优化点：Prompt 提示词 ---
    const prompt = `
    你是一个拥有20年经验的政务服务专家。你的任务是精准理解老百姓的口语，并将其“翻译”成政府公文中的标准术语。
    
    用户输入: "${query}"
    
    请严格按照以下步骤思考：
    1. 【语义映射】(最重要的步骤): 
       - 如果用户说“搞丢了”、“掉了”、“不见了”，必须映射到术语“遗失”、“补领”、“挂失”。
       - 如果用户说“开店”、“摆摊”，必须映射到术语“经营许可”、“营业执照”。
       - 如果用户说“生孩子”，必须映射到术语“生育”、“出生医学证明”。
       - 如果用户说“买房”，必须映射到术语“不动产”、“公积金”。
    
    2. 【实体提取】: 提取核心证件或事项名称（如“身份证” -> 标准术语“居民身份证”）。
    
    3. 【输出结果】: 生成一个包含所有可能术语的关键词列表。
    
    请严格只返回以下JSON格式：
    {
      "keywords": ["核心词1", "核心词2", "标准术语1", "标准术语2"],
      "target": "自然人" | "法人" | "all",
      "action": "办理" | "查询" | "all"
    }
    
    示例输入: "身份证搞丢了"
    示例输出: { "keywords": ["居民身份证", "身份证", "遗失", "补领", "挂失"], "target": "自然人", "action": "办理" }
    `;

    const completion = await client.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: model || "llama3-70b-8192",
      temperature: 0.3, // 稍微提高一点温度，让它能联想出更多同义词
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
