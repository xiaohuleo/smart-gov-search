import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { query, items, context, config } = await req.json();

    if (!config.apiKey) return NextResponse.json({ error: "No API Key" }, { status: 400 });

    // ==========================================
    // 阶段 1: 硬规则过滤 (Hard Filtering)
    // ==========================================
    
    // 1.1 渠道严格过滤
    // 逻辑：如果数据中的“发布渠道”不包含用户当前选的渠道，直接扔掉。
    const channelFiltered = items.filter(item => {
      const itemChannels = item['发布渠道'] || "";
      // 处理中文逗号、英文逗号、分号
      const channels = itemChannels.split(/[,，;]/).map(c => c.trim().toUpperCase());
      const userChannel = context.channel.toUpperCase();
      
      // 如果该事项没有填渠道，默认显示；或者必须包含当前渠道
      return channels.length === 0 || channels.includes(userChannel);
    });

    // 为了节省 Token，只取前 40 条通过渠道过滤的数据给 AI 打分
    // (实际生产环境这里会用向量数据库召回，Demo里直接切片)
    const candidates = channelFiltered.slice(0, 40).map(item => ({
      id: item['事项编码'],
      n: item['事项名称'],
      d: (item['事项描述'] || "").substring(0, 80), // 截断描述节省流量
    }));

    // ==========================================
    // 阶段 2: AI 语义打分 (Semantic Scoring)
    // ==========================================
    
    // 我们只问 AI 相关性，不让 AI 排序，排序我们自己做
    const systemPrompt = `你是一个相关性打分器。
    用户搜索: "${query}"。
    请对以下候选列表中的每一项打分 (0.0 - 1.0)，表示语义相关度。
    0.0 表示完全无关，1.0 表示非常精准。
    返回纯 JSON 数组: [{"id":"编码", "s":0.95, "r":"简短理由"}]`;

    const apiUrl = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
    
    let aiScoresMap = {};
    
    try {
      const apiRes = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(candidates) }
          ],
          temperature: 0.1,
          response_format: { type: "json_object" }
        })
      });

      const apiJson = await apiRes.json();
      const content = apiJson.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
      
      let parsed = [];
      try {
        const temp = JSON.parse(content);
        parsed = Array.isArray(temp) ? temp : (temp.results || []);
      } catch(e) { console.error("JSON Parse Error", content); }

      // 转为 Map 方便查询
      parsed.forEach(p => {
        aiScoresMap[p.id] = { score: p.s, reason: p.r };
      });

    } catch (err) {
      console.error("AI API Error:", err);
      // 如果 AI 挂了，降级为文本匹配，不至于空屏
    }

    // ==========================================
    // 阶段 3: 硬规则排序 (Strict Sorting)
    // ==========================================

    const finalResults = channelFiltered.map(item => {
      const code = item['事项编码'];
      const aiData = aiScoresMap[code] || { score: 0, reason: '' };
      
      // --- 3.1 角色匹配逻辑 ---
      const itemTargets = (item['服务对象'] || "").split(/[,，;]/).map(t => t.trim());
      const isRoleMatch = itemTargets.some(t => t.includes(context.userRole));
      // 如果角色匹配，给予巨大的权重 (10000分)，保证绝对置顶
      // 如果是“自然人/法人”这种通用的，也算匹配
      const roleScore = isRoleMatch ? 10000 : 0;

      // --- 3.2 定位匹配逻辑 ---
      const itemDept = item['所属市州单位'] || "";
      const isLocMatch = itemDept.includes(context.location) || itemDept.includes("省"); 
      // 省级或本市的优先，权重 100 分
      const locScore = isLocMatch ? 100 : 0;

      // --- 3.3 语义分数 ---
      // AI 分数是 0-1，放大 10 倍
      const semanticScore = (aiData.score || 0) * 10;

      // --- 3.4 满意度/高频 ---
      let extraScore = 0;
      if (context.useSatisfaction && item['满意度']) {
        extraScore += parseFloat(item['满意度']);
      }

      return {
        code: code,
        name: item['事项名称'],
        target: item['服务对象'],
        dept: item['所属市州单位'],
        reason: aiData.reason,
        aiScore: aiData.score, // 仅用于展示
        sortTags: isRoleMatch ? "角色匹配" : "其他角色",
        
        // 计算总排序分
        totalScore: roleScore + locScore + semanticScore + extraScore
      };
    });

    // 执行排序：总分降序
    // 过滤掉 AI 分数极低 (小于 0.1) 的噪音，除非硬匹配了角色
    const sorted = finalResults
      .filter(i => i.aiScore > 0.1 || i.totalScore > 1000) 
      .sort((a, b) => b.totalScore - a.totalScore);

    return NextResponse.json({ results: sorted });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
