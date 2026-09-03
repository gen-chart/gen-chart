// Authored teaching metadata for the generated instruction gallery.
// Chart facts stay in the adjacent typed JSON specs; this registry owns only
// the question and request that help a visitor reproduce each example.

export const GALLERY_CASES = [
  {
    id: 'build-times',
    spec: 'build-times.distribution.json',
    question: 'How do build times and outliers differ by pipeline?',
    prompt: {
      request: 'Compare build durations across our pipelines as a boxplot in seconds.',
      requirements: [
        'Show the outliers and highlight which pipeline is slowest and most variable.'
      ]
    },
    featured: true
  },
  {
    id: 'deploy-outcomes',
    spec: 'deploy-outcomes.cartesian.json',
    question: 'How did the composition of deployment outcomes change over six months?',
    prompt: {
      request: 'Show deployment outcomes over time as a 100%-stacked area chart.',
      requirements: [
        'Keep the months in chronological order and compare clean, rolled-back, and failed deployments.',
        'Explain the change in outcome shares without hiding the deployment totals.'
      ]
    }
  },
  {
    id: 'forecast-range',
    spec: 'forecast-range.cartesian.json',
    question: 'How wide is the uncertainty around the monthly revenue forecast?',
    prompt: {
      request: 'Show the monthly revenue forecast as a line with an uncertainty band.',
      requirements: [
        'Use the lower and upper columns as an 80% prediction interval and state that meaning explicitly.',
        'Keep the GBP-thousands unit, allow x-axis brush zoom, and explain how the interval changes.'
      ]
    }
  },
  {
    id: 'latency-distribution',
    spec: 'latency-distribution.distribution.json',
    question: 'What is the shape and right tail of API response times?',
    prompt: {
      request: 'Plot the raw API response-time observations as a histogram in milliseconds.',
      requirements: [
        'Disclose the histogram bins.',
        'Call out the typical range and the long right tail.'
      ]
    }
  },
  {
    id: 'mau-trend',
    spec: 'mau-trend.cartesian.json',
    question: 'How did monthly active and paying users change around the v2 launch?',
    prompt: {
      request: 'Compare monthly active users and paying users as two time-series lines.',
      requirements: [
        'Annotate the February 2026 v2 launch and enable x-axis brush zoom.',
        'Include the full-year, post-launch, and paying-only guided views from the evidence.'
      ]
    }
  },
  {
    id: 'plan-mix',
    spec: 'plan-mix.cartesian.json',
    question: 'How did the account mix change as paid plans grew?',
    prompt: {
      request: 'Show Free, Pro, and Enterprise account counts over time as a stacked area chart.',
      requirements: [
        'Keep the values as absolute account counts rather than normalizing them to percentages.',
        'Explain both total growth and the changing share of paid tiers.'
      ]
    }
  },
  {
    id: 'request-growth',
    spec: 'request-growth.cartesian.json',
    question: 'How can six years of request growth be shown without flattening the early years?',
    prompt: {
      request: 'Plot monthly request volume over time as a line chart with a logarithmic y-axis.',
      requirements: [
        'Disclose prominently that the y-axis is logarithmic.',
        'Explain why a log scale is necessary and what the curve says about the growth rate.'
      ]
    }
  },
  {
    id: 'revenue-by-region',
    spec: 'revenue-by-region.cartesian.json',
    question: 'How does Q2 revenue compare with Q1 across regions?',
    prompt: {
      request: 'Compare Q1 and Q2 revenue by region with grouped bars.',
      requirements: [
        'Keep the USD-thousands unit and a zero baseline.',
        'Highlight the fastest-growing region and the largest contributor.'
      ]
    }
  },
  {
    id: 'signups-vs-target',
    spec: 'signups-vs-target.cartesian.json',
    question: 'Which weeks beat the signup target, and is the gap changing?',
    prompt: {
      request: 'Compare weekly signups with the weekly target using bars for actuals and a line for target.',
      requirements: [
        'Use one signup unit and keep the bar axis at zero.',
        'Explain how often actuals beat target and call out the W31 dip.'
      ]
    }
  },
  {
    id: 'storage-mix',
    spec: 'storage-mix.cartesian.json',
    question: 'Which storage tier drove growth over the last five quarters?',
    prompt: {
      request: 'Show Hot, Warm, and Cold storage over time as stacked bars in terabytes.',
      requirements: [
        'Keep the values as absolute terabytes with a zero baseline.',
        'Explain total growth and how much of the increase came from cold archive.'
      ]
    }
  },
  {
    id: 'support-load',
    spec: 'support-load.matrix.json',
    question: 'Which day and shift combinations create the heaviest support load?',
    prompt: {
      request: 'Plot support tickets by day and shift as a sequential heatmap.',
      requirements: [
        'Keep the day and shift ordering and the ticket unit.',
        'Identify the weekday peak and the weekend pattern.'
      ]
    }
  },
  {
    id: 'traffic-sources',
    spec: 'traffic-sources.proportion.json',
    question: 'What share of signups comes from each traffic source?',
    prompt: {
      request: 'Show signup traffic sources as a donut chart.',
      requirements: [
        'Keep all six categories and the signup unit.',
        'Explain the largest source and compare the smaller tracked channels.'
      ]
    }
  },
  {
    id: 'venue-performance',
    spec: 'venue-performance.cartesian.json',
    question: 'How do advertising spend, event profit, and venue capacity relate?',
    prompt: {
      request: 'Create a bubble chart with advertising spend on x, event profit on y, and bubble size representing venue capacity.',
      requirements: [
        'Keep both financial measures in GBP thousands and capacity in seats.',
        'Show the capacity scale and keep every raw value available in the tooltip and data table.'
      ]
    }
  },
  {
    id: 'zh-revenue',
    spec: 'zh-revenue.cartesian.json',
    question: '各渠道的季度营收如何变化？',
    prompt: {
      request: '使用分组柱状图比较直销与渠道伙伴的季度营收。',
      requirements: [
        '保留中文标题、标签、结论和人民币百万元单位，并将查看器界面设为简体中文。',
        '说明第四季度总营收以及两种渠道的全年增速。'
      ]
    }
  }
];
