// Viewer-chrome localization. `meta.locale` selects the fixed strings the
// renderer owns — controls, stat labels, computed notes, month names — and
// never touches authored content: titles, labels, units, and card copy are
// reproduced exactly as written.

const STRINGS = {
  en: {
    'ui.theme': 'Theme',
    'ui.theme.toggle': 'Toggle color theme',
    'ui.color': 'Color',
    'ui.color.open': 'Choose chart color palette',
    'ui.color.heading': 'Color palette',
    'ui.color.reset': 'Reset',
    'ui.palette.classic': 'Classic',
    'ui.palette.cool': 'Cool',
    'ui.palette.warm': 'Warm',
    'ui.palette.primary': 'Primary',
    'ui.palette.stock': 'Stock',
    'ui.palette.blue-orange': 'Blue–Orange',
    'ui.palette.teal-magenta': 'Teal–Magenta',
    'ui.export': 'Export',
    'ui.export.png': 'Download PNG (2×)',
    'ui.export.svg': 'Download SVG',
    'ui.export.csv': 'Download data CSV',
    'ui.export.card': 'Share card (1200×630)',
    'ui.reset': 'Reset zoom',
    'ui.close': 'Close',
    'ui.series': 'Series',
    'ui.chapters': 'Guided views',
    'ui.views.clear': 'Clear view',
    'ui.chart': 'Chart',
    'ui.keyboard.hint': 'Use arrow keys to walk the data points.',
    'ui.table.caption': 'Chart data',
    'legend.sign': 'Direction',
    'legend.positive': 'Increase',
    'legend.negative': 'Decrease',
    'legend.zero': 'No change',
    'stat.min': 'min',
    'stat.max': 'max',
    'stat.mean': 'mean',
    'stat.last': 'last',
    'stat.points': 'points',
    'stat.count': 'count',
    'stat.share': 'share',
    'stat.value': 'value',
    'stat.n': 'n',
    'stat.median': 'median',
    'stat.q1': 'q1',
    'stat.q3': 'q3',
    'axis.count': 'Count',
    'note.boxplot': 'Box spans the interquartile range; whiskers reach 1.5×IQR; dots are outliers.',
    'note.histogram': '{n} observations in {bins} bins (Freedman-Diaconis suggested {suggested})',
    'note.matrix': '{rows} × {cols} grid, {kind} scale in {buckets} buckets',
    'note.horizontal-value-labels': 'Bar-end values are available in tooltips and the data table because they do not fit without overlap.',
    'note.point-density': 'Showing {rendered} of {source} visible points using deterministic systematic row-order sampling. The data table and CSV retain all source rows.',
    'scale.sequential': 'sequential',
    'scale.diverging': 'diverging',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  },
  'zh-CN': {
    'ui.theme': '主题',
    'ui.theme.toggle': '切换配色主题',
    'ui.color': '颜色',
    'ui.color.open': '选择图表配色',
    'ui.color.heading': '图表配色',
    'ui.color.reset': '重置',
    'ui.palette.classic': '经典',
    'ui.palette.cool': '冷色',
    'ui.palette.warm': '暖色',
    'ui.palette.primary': '原色',
    'ui.palette.stock': '股市',
    'ui.palette.blue-orange': '蓝橙',
    'ui.palette.teal-magenta': '青紫',
    'ui.export': '导出',
    'ui.export.png': '下载 PNG（2×）',
    'ui.export.svg': '下载 SVG',
    'ui.export.csv': '下载数据 CSV',
    'ui.export.card': '分享卡片（1200×630）',
    'ui.reset': '重置缩放',
    'ui.close': '关闭',
    'ui.series': '数据系列',
    'ui.chapters': '导览视图',
    'ui.views.clear': '清除视图',
    'ui.chart': '图表',
    'ui.keyboard.hint': '使用方向键浏览数据点。',
    'ui.table.caption': '图表数据',
    'legend.sign': '变化方向',
    'legend.positive': '增加',
    'legend.negative': '减少',
    'legend.zero': '无变化',
    'stat.min': '最小值',
    'stat.max': '最大值',
    'stat.mean': '平均值',
    'stat.last': '最新值',
    'stat.points': '数据点',
    'stat.count': '数量',
    'stat.share': '占比',
    'stat.value': '数值',
    'stat.n': '样本数',
    'stat.median': '中位数',
    'stat.q1': '下四分位',
    'stat.q3': '上四分位',
    'axis.count': '数量',
    'note.boxplot': '箱体为四分位距，须线延伸至 1.5×IQR，圆点为离群值。',
    'note.histogram': '{n} 个观测值分为 {bins} 个区间（Freedman-Diaconis 建议 {suggested} 个）',
    'note.matrix': '{rows} × {cols} 网格，{kind}色阶，{buckets} 个分段',
    'note.horizontal-value-labels': '条形末端数值无法在不重叠的情况下排版，可在提示和数据表中查看。',
    'note.point-density': '使用确定性的系统行顺序抽样显示 {source} 个可见数据点中的 {rendered} 个。数据表和 CSV 保留全部源数据行。',
    'scale.sequential': '连续',
    'scale.diverging': '发散',
    months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
  }
};

export function supportedLocales() {
  return Object.keys(STRINGS);
}

export function resolveLocale(locale) {
  return STRINGS[locale] ? locale : 'en';
}

export function t(locale, key, params = null) {
  const table = STRINGS[resolveLocale(locale)];
  let text = table[key];
  if (text === undefined) text = STRINGS.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v));
  }
  return text;
}

export function months(locale) {
  return STRINGS[resolveLocale(locale)].months;
}

// Every {{i18n:key}} placeholder the template may carry.
export function templateStrings(locale) {
  const table = STRINGS[resolveLocale(locale)];
  const out = {};
  for (const key of Object.keys(table)) {
    // Point-density disclosure is rendered into HTML on the server and does
    // not need to enlarge every chart's viewer payload.
    if (key === 'months' || key === 'note.point-density') continue;
    out[key] = t(locale, key);
  }
  return out;
}
