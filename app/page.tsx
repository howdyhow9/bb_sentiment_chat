"use client"

import React, { useEffect, useState } from 'react'
import { Flame, BarChart3, Layout, Settings, User, Send, RefreshCcw, AlertCircle, MessageSquare } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import Papa from 'papaparse'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface AnalysisData {
  timestamp: string
  model: string
  keyIssues: Array<{
    id: number
    title: string
    description: string
  }>
  recommendations: Array<{
    id: number
    title: string
    description: string
  }>
  metrics: {
    totalDuration: string
    promptEvalCount: number
    evalCount: number
  }
}

// Helper function to find relevant tweets based on query
const findRelevantTweets = (tweets: any[], query: string, limit: number = 5) => {
  const searchTerms = query.toLowerCase().split(' ');
  return tweets
    .filter(tweet => {
      const tweetText = tweet.text.toLowerCase();
      return searchTerms.some(term => tweetText.includes(term));
    })
    .slice(0, limit);
};

// Helper function to analyze sentiment trends
const analyzeSentimentTrends = (sentimentData: any) => {
  const sortedMonths = Object.entries(sentimentData.monthly_sentiment)
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime());
  
  return {
    earliest: sortedMonths[0],
    latest: sortedMonths[sortedMonths.length - 1],
    trend: sortedMonths.slice(-3) // Last 3 months
  };
};

// Helper function to find relevant recommendations
const findRelevantRecommendations = (analysisData: any, query: string) => {
  const searchTerms = query.toLowerCase().split(' ');
  return analysisData.recommendations.filter(rec => 
    searchTerms.some(term => 
      rec.title.toLowerCase().includes(term) || 
      rec.description.toLowerCase().includes(term)
    )
  );
};

// Helper function to find relevant key issues
const findRelevantIssues = (analysisData: any, query: string) => {
  const searchTerms = query.toLowerCase().split(' ');
  return analysisData.keyIssues.filter(issue => 
    searchTerms.some(term => 
      issue.title.toLowerCase().includes(term) || 
      issue.description.toLowerCase().includes(term)
    )
  );
};

const SentimentChart = ({ data }) => {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 h-96">
      <h2 className="text-lg font-semibold mb-4">Customer Sentiment Trends</h2>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="date" 
            stroke="#9CA3AF"
            tick={{ fill: '#9CA3AF' }}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis 
            stroke="#9CA3AF"
            tick={{ fill: '#9CA3AF' }}
            label={{ 
              value: 'Sentiment Score', 
              angle: -90, 
              position: 'insideLeft',
              fill: '#9CA3AF'
            }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1F2937',
              border: '1px solid #374151',
              color: '#F3F4F6'
            }}
          />
          <Line 
            type="monotone" 
            dataKey="sentiment" 
            stroke="#3B82F6"
            strokeWidth={2}
            dot={{ fill: '#3B82F6' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// Function to process chat context and query
const processDataForChat = async (query: string, analysisData: any, sentimentData: any, tweets: any) => {
  // Find relevant data based on query
  const relevantTweets = findRelevantTweets(tweets, query);
  const sentimentTrends = analyzeSentimentTrends(sentimentData);
  const relevantRecommendations = findRelevantRecommendations(analysisData, query);
  const relevantIssues = findRelevantIssues(analysisData, query);

  // Create a structured RAG prompt
  const context = `You are a data analysis assistant working with Amazon customer service data. You have access to these three data sources:

AVAILABLE DATA SOURCES:

1. amazonhelp_tweets.csv - Customer Service Interactions:
- Total tweets in dataset: ${tweets.length}
- Tweet fields: tweet_id, author_id, inbound, created_at, text, response_tweet_id
- Relevant examples for this query:
${relevantTweets.map(t => `  * [${t.created_at}] ${t.inbound === 'True' ? 'Customer' : 'Amazon'}: "${t.text}"`).join('\n')}

2. amazon_monthly_sentiment.json - Sentiment Analysis:
- Time range: ${sentimentTrends.earliest[0]} to ${sentimentTrends.latest[0]}
- Recent trends:
${sentimentTrends.trend.map(([month, data]) => 
  `  * ${month}: Score=${data.average_score.toFixed(2)} (${data.positive} positive, ${data.negative} negative, ${data.neutral} neutral)`
).join('\n')}

3. amazonhelp_analysis.json - Service Analysis:
- Analysis timestamp: ${analysisData.timestamp}
- Relevant Key Issues:
${relevantIssues.map(i => `  * ${i.title}: ${i.description}`).join('\n')}
- Relevant Recommendations:
${relevantRecommendations.map(r => `  * ${r.title}: ${r.description}`).join('\n')}

INSTRUCTIONS:
1. Only use data from these three sources
2. If information isn't in these sources, state that explicitly
3. Keep responses focused on the actual data
4. Please summarize the key information without extra details
5. Give me the most relevant fact, no additional context

User Question: ${query}

Based on ONLY the above data sources, provide an evidence-based response:`;

  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3.1',
        prompt: context,
        stream: false,
        temperature: 0.1, // Low temperature for more factual responses
        max_tokens: 500, // Limit response length
        stop: ["User Question:", "INSTRUCTIONS:"] // Stop at new sections
      }),
    });

    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    const data = await response.json();
    return data.response;
  } catch (error) {
    console.error('Error calling Ollama:', error);
    return 'Sorry, I encountered an error processing your request. Please try again.';
  }
}

export default function Dashboard() {
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chartData, setChartData] = useState([])
  const [tweets, setTweets] = useState([])
  const [sentimentData, setSentimentData] = useState(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load all data files
        const [analysisResponse, sentimentResponse, tweetsResponse] = await Promise.all([
          fetch('/amazonhelp_analysis.json'),
          fetch('/amazon_monthly_sentiment.json'),
          fetch('/amazonhelp_tweets.csv')
        ]);

        const analysisJson = await analysisResponse.json();
        const sentimentJson = await sentimentResponse.json();
        const tweetsText = await tweetsResponse.text();
        
        setAnalysisData(analysisJson.analysisData);
        setSentimentData(sentimentJson);
        
        // Process tweets with proper typing
        const parsedTweets = Papa.parse(tweetsText, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true // Convert numerical values automatically
        }).data;
        setTweets(parsedTweets);

        // Process chart data
        const monthlyData = Object.entries(sentimentJson.monthly_sentiment)
          .map(([date, data]) => ({
            date,
            sentiment: data.average_score,
            positive: data.positive,
            negative: data.negative,
            neutral: data.neutral
          }))
          .sort((a, b) => new Date(a.date) - new Date(b.date));

        setChartData(monthlyData);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const newUserMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, newUserMessage]);
    setInput('');
    setChatLoading(true);

    try {
      // Get AI response using the data context
      const response = await processDataForChat(input, analysisData, sentimentData, tweets);
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: response 
      }]);
    } catch (error) {
      console.error('Error in chat:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error processing your request. Please try again.' 
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>;
  if (!analysisData) return null;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="border-b border-gray-800">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-8">
              <Flame className="h-8 w-8 text-orange-500" />
              <nav className="flex items-center space-x-4">
                <button className="text-white hover:text-gray-300 flex items-center px-3 py-2">
                  <Layout className="mr-2 h-4 w-4" />
                  Overview
                </button>
                <button className="text-white hover:text-gray-300 flex items-center px-3 py-2">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Competitor Dashboard
                </button>
                <button className="text-white hover:text-gray-300 flex items-center px-3 py-2">
                  <Layout className="mr-2 h-4 w-4" />
                  Content Builder
                </button>
                <button className="text-white hover:text-gray-300 flex items-center px-3 py-2">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </button>
              </nav>
            </div>
            <button className="text-white hover:text-gray-300 p-2">
              <User className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Customer Service Analysis</h1>
          <div className="flex items-center text-sm text-gray-400">
            <RefreshCcw className="mr-2 h-4 w-4" />
            Last analyzed: {new Date(analysisData.timestamp).toLocaleString()}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* Sentiment Chart - Full Width */}
          <div className="col-span-12">
            <SentimentChart data={chartData} />
          </div>

          {/* Chat Section */}
          <div className="col-span-8">
            <div className="bg-gray-800 border border-gray-700 rounded-lg">
              <div className="p-4 border-b border-gray-700">
                <div className="flex items-center">
                  <MessageSquare className="mr-2 h-5 w-5" />
                  <h2 className="text-lg font-semibold">Chat with Your Data</h2>
                </div>
              </div>
              <div className="p-4 h-[500px] flex flex-col justify-between">
                <div className="flex-grow mb-4 overflow-y-auto space-y-4">
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg ${
                        message.role === 'user' 
                          ? 'bg-blue-500/20 ml-4' 
                          : 'bg-gray-700 mr-4'
                      }`}
                    >
                      <div className="text-sm">{message.content}</div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="text-sm text-gray-400 animate-pulse">
                      Analyzing...
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white placeholder-gray-400"
                    placeholder="Ask about your data..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  />
                  <button 
                    className="p-2 text-white hover:text-gray-300 disabled:opacity-50"
                    onClick={handleSendMessage}
                    disabled={chatLoading}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="col-span-4 space-y-6">
            <div className="bg-gray-800 border border-gray-700 rounded-lg">
              <div className="p-4 border-b border-gray-700">
                <h2 className="text-lg font-semibold">Key Issues Identified</h2>
                <p className="text-sm text-gray-400">Major customer service concerns</p>
              </div>
              <div className="p-4">
                <div className="space-y-4">
                  {analysisData.keyIssues.map((issue) => (
                    <div key={issue.id} className="rounded-lg bg-gray-700 p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
                        <div>
                          <div className="font-medium">{issue.title}</div>
                          <div className="mt-1 text-sm text-gray-400">{issue.description}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-lg">
              <div className="p-4 border-b border-gray-700">
                <h2 className="text-lg font-semibold">Recommendations</h2>
                <p className="text-sm text-gray-400">Suggested improvements</p>
              </div>
              <div className="p-4">
                <ul className="space-y-4">
                  {analysisData.recommendations.map((rec) => (
                    <li key={rec.id} className="flex items-start space-x-2">
                      <div className="rounded-full bg-blue-500/10 p-1">
                        <BarChart3 className="h-4 w-4 text-blue-400" />
                      </div>
                      <div>
                        <div className="font-medium">{rec.title}</div>
                        <div className="text-sm text-gray-400">{rec.description}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}