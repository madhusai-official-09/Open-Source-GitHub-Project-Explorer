import React, { useState, useEffect, useCallback } from 'react';

// Main App component
export default function App() {
  const [repositories, setRepositories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [languageFilter, setLanguageFilter] = useState('');
  const [sortBy, setSortBy] = useState('stars'); // 'stars', 'updated'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc', 'desc'
  const [bookmarkedRepos, setBookmarkedRepos] = useState(() => {
    // Load bookmarked repos from local storage on initial load
    try {
      const saved = localStorage.getItem('bookmarkedRepos');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.error("Failed to parse bookmarked repos from localStorage", e);
      return {};
    }
  });

  // State to store generated summaries for repositories
  const [repoSummaries, setRepoSummaries] = useState({});
  // State to manage loading for individual summary generation
  const [summaryLoading, setSummaryLoading] = useState({});

  // Fetch repositories from GitHub API
  const fetchRepositories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = searchTerm ? `q=${searchTerm}+` : 'q=stars:>1000'; // Default to popular repos
      const languageQuery = languageFilter ? `language:${languageFilter}` : '';
      const sortQuery = `sort=${sortBy}&order=${sortOrder}`;

      const response = await fetch(
        `https://api.github.com/search/repositories?${query}${languageQuery}&${sortQuery}&per_page=30`,
        {
          headers: {
            // NOTE: Replace with your GitHub Personal Access Token if hitting rate limits.
            // Authorization: `token YOUR_GITHUB_PERSONAL_ACCESS_TOKEN`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const data = await response.json();
      setRepositories(data.items || []);
    } catch (err) {
      setError(`Failed to fetch repositories: ${err.message}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, languageFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchRepositories();
  }, [fetchRepositories]);

  // Handle bookmarking
  const toggleBookmark = (repoId, repo) => {
    setBookmarkedRepos(prev => {
      const newBookmarks = { ...prev };
      if (newBookmarks[repoId]) {
        delete newBookmarks[repoId];
      } else {
        newBookmarks[repoId] = { ...repo, note: prev[repoId]?.note || '' }; // Preserve note if exists
      }
      localStorage.setItem('bookmarkedRepos', JSON.stringify(newBookmarks));
      return newBookmarks;
    });
  };

  // Handle note taking
  const updateNote = (repoId, note) => {
    setBookmarkedRepos(prev => {
      const newBookmarks = { ...prev };
      if (newBookmarks[repoId]) {
        newBookmarks[repoId].note = note;
      }
      localStorage.setItem('bookmarkedRepos', JSON.stringify(newBookmarks));
      return newBookmarks;
    });
  };

  // LLM Call: Generate Repository Summary
  const generateRepoSummary = useCallback(async (repoId, repoName, repoDescription) => {
    setSummaryLoading(prev => ({ ...prev, [repoId]: true }));
    try {
      const prompt = `Summarize the following GitHub repository. Focus on its purpose and main features, in about 2-3 sentences.
        Repository Name: ${repoName}
        Description: ${repoDescription || 'No description provided.'}`;

      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = { contents: chatHistory };
      const apiKey = ""; // Canvas will provide this in runtime
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const text = result.candidates[0].content.parts[0].text;
        setRepoSummaries(prev => ({ ...prev, [repoId]: text }));
      } else {
        setRepoSummaries(prev => ({ ...prev, [repoId]: 'Could not generate summary.' }));
        console.error("Gemini API response structure unexpected:", result);
      }
    } catch (err) {
      setRepoSummaries(prev => ({ ...prev, [repoId]: `Error generating summary: ${err.message}` }));
      console.error("Error calling Gemini API:", err);
    } finally {
      setSummaryLoading(prev => ({ ...prev, [repoId]: false }));
    }
  }, []);


  // LLM Call: Generate "Why it's cool" blurb for bookmarked repo
  const generateCoolBlurb = useCallback(async (repoId, repoName, repoDescription) => {
    setSummaryLoading(prev => ({ ...prev, [`cool-blurb-${repoId}`]: true }));
    try {
      const prompt = `Write a short, engaging, and enthusiastic blurb (1-2 sentences) about why the following GitHub repository is cool and noteworthy.
        Repository Name: ${repoName}
        Description: ${repoDescription || 'No description provided.'}`;

      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = { contents: chatHistory };
      const apiKey = ""; // Canvas will provide this in runtime
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const text = result.candidates[0].content.parts[0].text;
        updateNote(repoId, `Cool blurb: ${text}\n\n${bookmarkedRepos[repoId]?.note || ''}`);
      } else {
        updateNote(repoId, `Could not generate cool blurb.\n\n${bookmarkedRepos[repoId]?.note || ''}`);
        console.error("Gemini API response structure unexpected for cool blurb:", result);
      }
    } catch (err) {
      updateNote(repoId, `Error generating cool blurb: ${err.message}\n\n${bookmarkedRepos[repoId]?.note || ''}`);
      console.error("Error calling Gemini API for cool blurb:", err);
    } finally {
      setSummaryLoading(prev => ({ ...prev, [`cool-blurb-${repoId}`]: false }));
    }
  }, [bookmarkedRepos, updateNote]);


  // Filtering repositories (client-side for simplicity, could be server-side)
  const filteredAndSortedRepos = repositories.filter(repo => {
    const matchesSearch = searchTerm
      ? repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (repo.description && repo.description.toLowerCase().includes(searchTerm.toLowerCase()))
      : true;
    const matchesLanguage = languageFilter
      ? repo.language && repo.language.toLowerCase() === languageFilter.toLowerCase()
      : true;
    return matchesSearch && matchesLanguage;
  }).sort((a, b) => {
    if (sortBy === 'stars') {
      return sortOrder === 'desc' ? b.stargazers_count - a.stargazers_count : a.stargazers_count - b.stargazers_count;
    }
    if (sortBy === 'updated') {
      const dateA = new Date(a.updated_at);
      const dateB = new Date(b.updated_at);
      return sortOrder === 'desc' ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
    }
    return 0;
  });

  // Dummy data for chart visualization (replace with actual data processing)
  const chartData = {
    labels: ['Language A', 'Language B', 'Language C'],
    datasets: [
      {
        label: 'Stars by Language',
        data: [1200, 800, 1500],
        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56'],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6 font-inter text-gray-800">
      <header className="text-center mb-10">
        <h1 className="text-5xl font-extrabold text-indigo-700 mb-4 tracking-tight">
          GitHub Explorer 🐙✨ <br className="sm:hidden" />
          <span className="text-3xl text-gray-600">Discover Trending Repositories</span>
        </h1>
        <p className="text-lg text-gray-600">
          Unearth amazing open-source projects! 🚀
        </p>
      </header>

      {/* Filters and Sorting */}
      <section className="bg-white rounded-2xl shadow-xl p-6 mb-8 max-w-4xl mx-auto border border-blue-200">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Search Bar */}
          <div>
            <label htmlFor="search" className="block text-sm font-semibold text-gray-700 mb-2">
              🔍 Search Repositories:
            </label>
            <input
              type="text"
              id="search"
              placeholder="e.g., react, machine learning"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition duration-200"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Language Filter */}
          <div>
            <label htmlFor="language" className="block text-sm font-semibold text-gray-700 mb-2">
              🗣️ Filter by Language:
            </label>
            <input
              type="text"
              id="language"
              placeholder="e.g., JavaScript, Python"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition duration-200"
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
            />
          </div>

          {/* Sort By */}
          <div>
            <label htmlFor="sortBy" className="block text-sm font-semibold text-gray-700 mb-2">
              📊 Sort By:
            </label>
            <select
              id="sortBy"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition duration-200"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="stars">⭐ Stars</option>
              <option value="updated">⏰ Last Updated</option>
            </select>
          </div>

          {/* Sort Order */}
          <div>
            <label htmlFor="sortOrder" className="block text-sm font-semibold text-gray-700 mb-2">
              ↕️ Order:
            </label>
            <select
              id="sortOrder"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition duration-200"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        </div>
        <div className="mt-6 text-center">
          <button
            onClick={fetchRepositories}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl shadow-md transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Refresh Repositories ✨
          </button>
        </div>
      </section>

      {/* Chart Section (Placeholder) */}
      <section className="bg-white rounded-2xl shadow-xl p-6 mb-8 max-w-4xl mx-auto border border-purple-200">
        <h2 className="text-3xl font-bold text-purple-700 mb-4 text-center">
          Analytics & Insights 📈
        </h2>
        <p className="text-gray-600 mb-4 text-center">
          (Chart.js integration for contributions, issues, etc., would go here.
          For a full implementation, you'd import Chart.js and a React wrapper
          like `react-chartjs-2`, process your `repositories` data into suitable
          formats, and render different chart types.)
        </p>
        <div className="bg-gray-100 rounded-lg p-4 text-center text-gray-500 italic">
          {/* Example: <Bar data={chartData} options={chartOptions} /> */}
          <p>Chart Placeholder: Visualizing data like stars per language or issue trends.</p>
          <div className="w-full h-48 bg-gray-200 rounded-lg flex items-center justify-center">
            📊 Placeholder Chart Area 📊
          </div>
        </div>
      </section>

      {/* Repository List */}
      <section className="max-w-6xl mx-auto">
        {loading && (
          <p className="text-center text-indigo-500 text-xl font-semibold animate-pulse">
            Loading awesome repos... 🚀
          </p>
        )}
        {error && (
          <p className="text-center text-red-500 text-xl font-semibold">
            Oops! Error: {error} 😵
          </p>
        )}
        {!loading && filteredAndSortedRepos.length === 0 && (
          <p className="text-center text-gray-500 text-xl font-semibold">
            No repositories found. Try a different search! 🤷‍♀️
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAndSortedRepos.map((repo) => (
            <div
              key={repo.id}
              className="bg-white rounded-2xl shadow-lg p-6 border border-green-200 transform transition duration-300 ease-in-out hover:scale-103 hover:shadow-xl flex flex-col justify-between"
            >
              <div>
                <h3 className="text-xl font-bold text-indigo-600 mb-2 truncate">
                  <a
                    href={repo.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {repo.name}
                  </a>
                </h3>
                <p className="text-gray-700 text-sm mb-3 line-clamp-3">
                  {repo.description || 'No description provided.'}
                </p>
                <div className="flex items-center text-gray-500 text-sm mb-2">
                  <span className="mr-2">⭐</span> {repo.stargazers_count} stars
                </div>
                {repo.language && (
                  <div className="flex items-center text-gray-500 text-sm mb-2">
                    <span className="mr-2">🗣️</span> {repo.language}
                  </div>
                )}
                <div className="flex items-center text-gray-500 text-sm mb-4">
                  <span className="mr-2">⏰</span> Last updated: {new Date(repo.updated_at).toLocaleDateString()}
                </div>

                {/* AI-generated summary display */}
                {repoSummaries[repo.id] && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800 border border-blue-200">
                    <strong className="block mb-1">AI Summary:</strong>
                    {repoSummaries[repo.id]}
                  </div>
                )}
              </div>

              {/* Action buttons (Summary and Bookmark) */}
              <div className="mt-4 pt-4 border-t border-gray-200 flex flex-col gap-2">
                <button
                  onClick={() => generateRepoSummary(repo.id, repo.name, repo.description)}
                  className="w-full py-2 px-4 rounded-lg font-semibold transition duration-200 bg-purple-100 text-purple-700 hover:bg-purple-200"
                  disabled={summaryLoading[repo.id]}
                >
                  {summaryLoading[repo.id] ? 'Generating Summary... 🧠' : '✨ Generate Summary'}
                </button>
                <button
                  onClick={() => toggleBookmark(repo.id, repo)}
                  className={`w-full py-2 px-4 rounded-lg font-semibold transition duration-200 ${
                    bookmarkedRepos[repo.id]
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  {bookmarkedRepos[repo.id] ? '❤️ Bookmarked!' : '🔖 Bookmark This'}
                </button>
                {bookmarkedRepos[repo.id] && (
                  <textarea
                    className="w-full mt-3 p-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-blue-400"
                    placeholder="Add a personal note about this repo..."
                    value={bookmarkedRepos[repo.id]?.note || ''}
                    onChange={(e) => updateNote(repo.id, e.target.value)}
                    rows="3"
                  ></textarea>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bookmarked Repositories Section */}
      {Object.keys(bookmarkedRepos).length > 0 && (
        <section className="mt-12 max-w-6xl mx-auto bg-white rounded-2xl shadow-xl p-6 border border-orange-200">
          <h2 className="text-3xl font-bold text-orange-700 mb-6 text-center">
            My Bookmarked Repositories ⭐📚
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.values(bookmarkedRepos).map((repo) => (
              <div
                key={repo.id}
                className="bg-orange-50 rounded-lg p-5 shadow-sm border border-orange-300 flex flex-col justify-between"
              >
                <div>
                  <h3 className="text-lg font-bold text-orange-800 mb-1 truncate">
                    <a
                      href={repo.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {repo.name}
                    </a>
                  </h3>
                  <p className="text-gray-700 text-sm mb-2 line-clamp-2">
                    {repo.description || 'No description provided.'}
                  </p>
                  <p className="text-gray-600 text-xs italic mb-2 whitespace-pre-wrap">
                    Your note: {bookmarkedRepos[repo.id]?.note || 'No note yet.'}
                  </p>
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    onClick={() => generateCoolBlurb(repo.id, repo.name, repo.description)}
                    className="bg-yellow-100 text-yellow-700 hover:bg-yellow-200 py-2 px-3 rounded-md text-sm font-semibold transition duration-200"
                    disabled={summaryLoading[`cool-blurb-${repo.id}`]}
                  >
                    {summaryLoading[`cool-blurb-${repo.id}`] ? 'Brewing Blurb... ✍️' : '🌟 Generate Cool Blurb!'}
                  </button>
                  <button
                    onClick={() => toggleBookmark(repo.id, repo)}
                    className="bg-orange-200 text-orange-800 hover:bg-orange-300 py-2 px-3 rounded-md text-sm font-semibold transition duration-200"
                  >
                    Remove Bookmark 🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tailwind CSS Script - ALWAYS include this for styling */}
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>
        {`
          body {
            font-family: 'Inter', sans-serif;
          }
        `}
      </style>
    </div>
  );
}