import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Plus, Coins, RefreshCw } from 'lucide-react';

// Note: In production, these should be moved to environment variables (e.g., REACT_APP_SUPABASE_URL)
// The anon key below is designed to be public and safe for client-side use with proper RLS policies
const SUPABASE_URL = 'https://xhgozdhqfmxeufebbrmt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoZ296ZGhxZm14ZXVmZWJicm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNjQ1MDYsImV4cCI6MjA3OTg0MDUwNn0.4_RFFgCHjSquyjO4Hf3NKfjt288rN0WMZ_STobQME10';

const PredictionMarket = () => {
  const [markets, setMarkets] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [showCreateMarket, setShowCreateMarket] = useState(false);
  const [newMarket, setNewMarket] = useState({ question: '', endDate: '' });
  const [customBets, setCustomBets] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const supabase = useCallback(async (endpoint, options = {}) => {
    try {
      const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
      console.log('Making request to:', url);
      
      const response = await fetch(url, {
        ...options,
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
          ...options.headers,
        },
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Supabase error:', errorText);
        throw new Error(`API error (${response.status}): ${errorText}`);
      }

      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } catch (err) {
      console.error('Request failed:', err);
      throw err;
    }
  }, []);

  const initUser = useCallback(async () => {
    try {
      setError(null);
      let userId = localStorage.getItem('userId');

      if (userId) {
        try {
          const users = await supabase(`users?id=eq.${userId}`);
          if (users && users.length > 0) {
            setCurrentUser(users[0]);
            setLoading(false);
            return;
          }
        } catch (err) {
          console.log('User not found, creating new user');
        }
      }

      const adjectives = ['Happy', 'Lucky', 'Wise', 'Clever', 'Bold', 'Swift', 'Bright', 'Cool'];
      const nouns = ['Panda', 'Fox', 'Eagle', 'Lion', 'Bear', 'Wolf', 'Owl', 'Tiger'];
      const userName = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;

      const newUsers = await supabase('users', {
        method: 'POST',
        body: JSON.stringify({ name: userName, balance: 1000 })
      });

      if (newUsers && newUsers.length > 0) {
        const user = newUsers[0];
        localStorage.setItem('userId', user.id);
        setCurrentUser(user);
      }
    } catch (error) {
      console.error('Error initializing user:', error);
      setError('Failed to connect to database. Please check your Supabase configuration.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const loadMarkets = useCallback(async () => {
    try {
      const marketsData = await supabase('markets?order=created_at.desc');

      const marketsWithBids = await Promise.all(
        marketsData.map(async (market) => {
          const bids = await supabase(`bids?market_id=eq.${market.id}&order=created_at.desc`);
          return { ...market, bids: bids || [] };
        })
      );

      setMarkets(marketsWithBids);

      setCurrentUser(prevUser => {
        if (prevUser) {
          supabase(`users?id=eq.${prevUser.id}`).then(users => {
            if (users && users.length > 0) {
              setCurrentUser(users[0]);
            }
          });
        }
        return prevUser;
      });
    } catch (error) {
      console.error('Error loading markets:', error);
    }
  }, [supabase]);

  useEffect(() => {
    initUser();
  }, [initUser]);

  useEffect(() => {
    if (currentUser) {
      loadMarkets();
      const interval = setInterval(loadMarkets, 5000);
      return () => clearInterval(interval);
    }
  }, [currentUser, loadMarkets]);

  const createMarket = async () => {
    if (!newMarket.question.trim() || !newMarket.endDate) {
      alert('Please fill in all fields');
      return;
    }

    try {
      await supabase('markets', {
        method: 'POST',
        body: JSON.stringify({
          question: newMarket.question,
          end_date: newMarket.endDate,
          yes_shares: 50,
          no_shares: 50,
          created_by: currentUser.id
        })
      });

      setNewMarket({ question: '', endDate: '' });
      setShowCreateMarket(false);
      await loadMarkets();
    } catch (error) {
      console.error('Error creating market:', error);
      alert('Error creating market: ' + error.message);
    }
  };

  const calculatePrice = (yesShares, noShares) => {
    const total = parseFloat(yesShares) + parseFloat(noShares);
    return Math.round((parseFloat(yesShares) / total) * 100);
  };

  const placeBid = async (marketId, position, amount) => {
    const market = markets.find(m => m.id === marketId);
    if (!market || market.resolved) return;

    if (currentUser.balance < amount) {
      alert('Insufficient balance!');
      return;
    }

    if (amount <= 0) {
      alert('Please enter a valid amount!');
      return;
    }

    try {
      await supabase('bids', {
        method: 'POST',
        body: JSON.stringify({
          market_id: marketId,
          user_id: currentUser.id,
          user_name: currentUser.name,
          position: position,
          amount: amount,
          shares: amount
        })
      });

      const newYesShares = position === 'yes'
        ? parseFloat(market.yes_shares) + amount
        : parseFloat(market.yes_shares);
      const newNoShares = position === 'no'
        ? parseFloat(market.no_shares) + amount
        : parseFloat(market.no_shares);

      await supabase(`markets?id=eq.${marketId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          yes_shares: newYesShares,
          no_shares: newNoShares
        })
      });

      await supabase(`users?id=eq.${currentUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          balance: currentUser.balance - amount
        })
      });

      setCustomBets({ ...customBets, [marketId]: '' });
      await loadMarkets();
    } catch (error) {
      console.error('Error placing bid:', error);
      alert('Error placing bid: ' + error.message);
    }
  };

  const resolveMarket = async (marketId, outcome) => {
    const market = markets.find(m => m.id === marketId);
    if (!market || market.resolved) return;

    if (!window.confirm(`Are you sure you want to resolve this market as ${outcome.toUpperCase()}? This cannot be undone.`)) {
      return;
    }

    try {
      await supabase(`markets?id=eq.${marketId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          resolved: true,
          outcome: outcome
        })
      });

      const winningBids = market.bids.filter(b => b.position === outcome);
      const losingBids = market.bids.filter(b => b.position !== outcome);

      const totalWinningShares = winningBids.reduce((sum, bid) => sum + bid.shares, 0);
      const totalPool = market.bids.reduce((sum, bid) => sum + bid.amount, 0);

      const userWinnings = {};
      winningBids.forEach(bid => {
        if (!userWinnings[bid.user_id]) {
          userWinnings[bid.user_id] = 0;
        }
        const payout = totalWinningShares > 0 ? (bid.shares / totalWinningShares) * totalPool : 0;
        userWinnings[bid.user_id] += payout;
      });

      for (const [userId, winnings] of Object.entries(userWinnings)) {
        const users = await supabase(`users?id=eq.${userId}`);
        if (users && users.length > 0) {
          const user = users[0];
          await supabase(`users?id=eq.${userId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              balance: Math.round(user.balance + winnings)
            })
          });
        }
      }

      if (userWinnings[currentUser.id]) {
        alert(`You won ${Math.round(userWinnings[currentUser.id])} coins! 🎉`);
      } else if (losingBids.some(b => b.user_id === currentUser.id)) {
        alert(`Market resolved as ${outcome.toUpperCase()}. Better luck next time!`);
      }

      await loadMarkets();
    } catch (error) {
      console.error('Error resolving market:', error);
      alert('Error resolving market: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-purple-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-semibold">Loading markets...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Connection Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <div className="text-left bg-gray-50 rounded p-4 text-sm">
            <p className="font-semibold mb-2">Troubleshooting:</p>
            <ol className="list-decimal list-inside space-y-1 text-gray-700">
              <li>Check that your Supabase project is running</li>
              <li>Verify the API URL and key are correct</li>
              <li>Ensure the tables exist: users, markets, bids</li>
              <li>Check that RLS policies allow anonymous access</li>
            </ol>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 bg-purple-500 text-white px-6 py-2 rounded-lg hover:bg-purple-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 font-semibold">Error loading user. Please refresh the page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">🎯 Family Prediction Market</h1>
              <p className="text-gray-600">Make predictions with play money!</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-gray-600">Playing as</p>
                <p className="font-semibold text-gray-800">{currentUser.name}</p>
                <div className="flex items-center justify-end gap-1 text-purple-600 font-bold">
                  <Coins className="w-4 h-4" />
                  <span>{currentUser.balance}</span>
                </div>
              </div>
              <button
                onClick={loadMarkets}
                className="p-3 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all"
                title="Refresh"
              >
                <RefreshCw className="w-5 h-5 text-gray-600" />
              </button>
              <button
                onClick={() => setShowCreateMarket(!showCreateMarket)}
                className="bg-gradient-to-r from-purple-500 to-blue-500 text-white px-6 py-3 rounded-lg font-semibold hover:from-purple-600 hover:to-blue-600 transition-all flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                New Market
              </button>
            </div>
          </div>
        </div>

        {showCreateMarket && (
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Create New Prediction</h2>
            <input
              type="text"
              placeholder="What will happen? (e.g., Will it snow on Christmas?)"
              value={newMarket.question}
              onChange={(e) => setNewMarket({ ...newMarket, question: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg mb-4 focus:border-purple-500 focus:outline-none"
            />
            <input
              type="date"
              value={newMarket.endDate}
              onChange={(e) => setNewMarket({ ...newMarket, endDate: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg mb-4 focus:border-purple-500 focus:outline-none"
            />
            <div className="flex gap-3">
              <button
                onClick={createMarket}
                className="flex-1 bg-gradient-to-r from-purple-500 to-blue-500 text-white py-3 rounded-lg font-semibold hover:from-purple-600 hover:to-blue-600 transition-all"
              >
                Create Market
              </button>
              <button
                onClick={() => setShowCreateMarket(false)}
                className="px-6 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-6">
          {markets.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
              <TrendingUp className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-600 mb-2">No markets yet!</h3>
              <p className="text-gray-500">Create your first prediction to get started</p>
            </div>
          ) : (
            markets.map(market => {
              const yesPrice = calculatePrice(market.yes_shares, market.no_shares);
              const noPrice = 100 - yesPrice;

              return (
                <div key={market.id} className="bg-white rounded-2xl shadow-xl overflow-hidden">
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-xl font-bold text-gray-800 flex-1">{market.question}</h3>
                      {market.resolved && (
                        <span className="ml-4 px-4 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
                          Resolved: {market.outcome === 'yes' ? 'YES' : 'NO'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-4">Ends: {new Date(market.end_date).toLocaleDateString()}</p>

                    <div className="grid md:grid-cols-2 gap-4 mb-6">
                      <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border-2 border-green-200">
                        <div className="flex justify-between items-center mb-3">
                          <span className="font-bold text-green-800">YES</span>
                          <div className="flex items-center gap-1">
                            <TrendingUp className="w-4 h-4 text-green-600" />
                            <span className="text-2xl font-bold text-green-800">{yesPrice}%</span>
                          </div>
                        </div>
                        <div className="text-xs text-green-700 mb-3">
                          Pool: {Math.round(market.yes_shares)} shares
                        </div>
                        {!market.resolved && (
                          <>
                            <div className="flex gap-2 mb-2">
                              {[10, 25, 50, 100].map(amount => (
                                <button
                                  key={amount}
                                  onClick={() => placeBid(market.id, 'yes', amount)}
                                  className="flex-1 bg-green-500 text-white py-2 rounded-lg text-sm font-semibold hover:bg-green-600 transition-all"
                                >
                                  {amount}
                                </button>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                placeholder="Custom"
                                value={customBets[market.id] || ''}
                                onChange={(e) => setCustomBets({ ...customBets, [market.id]: e.target.value })}
                                className="flex-1 px-3 py-2 border-2 border-green-300 rounded-lg text-sm focus:border-green-500 focus:outline-none"
                              />
                              <button
                                onClick={() => placeBid(market.id, 'yes', parseInt(customBets[market.id]) || 0)}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-all"
                              >
                                Bet
                              </button>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 border-2 border-red-200">
                        <div className="flex justify-between items-center mb-3">
                          <span className="font-bold text-red-800">NO</span>
                          <div className="flex items-center gap-1">
                            <TrendingDown className="w-4 h-4 text-red-600" />
                            <span className="text-2xl font-bold text-red-800">{noPrice}%</span>
                          </div>
                        </div>
                        <div className="text-xs text-red-700 mb-3">
                          Pool: {Math.round(market.no_shares)} shares
                        </div>
                        {!market.resolved && (
                          <>
                            <div className="flex gap-2 mb-2">
                              {[10, 25, 50, 100].map(amount => (
                                <button
                                  key={amount}
                                  onClick={() => placeBid(market.id, 'no', amount)}
                                  className="flex-1 bg-red-500 text-white py-2 rounded-lg text-sm font-semibold hover:bg-red-600 transition-all"
                                >
                                  {amount}
                                </button>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                placeholder="Custom"
                                value={customBets[market.id] || ''}
                                onChange={(e) => setCustomBets({ ...customBets, [market.id]: e.target.value })}
                                className="flex-1 px-3 py-2 border-2 border-red-300 rounded-lg text-sm focus:border-red-500 focus:outline-none"
                              />
                              <button
                                onClick={() => placeBid(market.id, 'no', parseInt(customBets[market.id]) || 0)}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-all"
                              >
                                Bet
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {market.bids.length > 0 && (
                      <div className="mb-4">
                        <h4 className="font-semibold text-gray-700 mb-2 text-sm">Recent Activity</h4>
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {market.bids.slice(0, 5).map((bid, idx) => (
                            <div key={idx} className="text-sm text-gray-600 bg-gray-50 rounded p-2 flex justify-between items-center">
                              <div>
                                <span className="font-semibold">{bid.user_name}</span> bet{' '}
                                <span className="font-semibold text-purple-600">{bid.amount}</span> on{' '}
                                <span className={`font-semibold ${bid.position === 'yes' ? 'text-green-600' : 'text-red-600'}`}>
                                  {bid.position.toUpperCase()}
                                </span>
                              </div>
                              {bid.created_at && (
                                <span className="text-xs text-gray-400">
                                  {new Date(bid.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(() => {
                      const userBids = market.bids.filter(b => b.user_id === currentUser.id);
                      if (userBids.length > 0) {
                        const yesBets = userBids.filter(b => b.position === 'yes').reduce((sum, b) => sum + b.amount, 0);
                        const noBets = userBids.filter(b => b.position === 'no').reduce((sum, b) => sum + b.amount, 0);
                        return (
                          <div className="mb-4 p-3 bg-purple-50 rounded-lg border border-purple-200">
                            <h4 className="font-semibold text-purple-900 text-sm mb-1">Your Position</h4>
                            <div className="flex gap-4 text-sm">
                              {yesBets > 0 && (
                                <span className="text-green-700">YES: <span className="font-semibold">{yesBets} coins</span></span>
                              )}
                              {noBets > 0 && (
                                <span className="text-red-700">NO: <span className="font-semibold">{noBets} coins</span></span>
                              )}
                              <span className="text-purple-700">Total invested: <span className="font-semibold">{yesBets + noBets}</span></span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {!market.resolved && new Date(market.end_date) <= new Date() && (
                      <div className="flex gap-3 pt-4 border-t-2">
                        <button
                          onClick={() => resolveMarket(market.id, 'yes')}
                          className="flex-1 bg-green-500 text-white py-2 rounded-lg font-semibold hover:bg-green-600 transition-all"
                        >
                          Resolve YES
                        </button>
                        <button
                          onClick={() => resolveMarket(market.id, 'no')}
                          className="flex-1 bg-red-500 text-white py-2 rounded-lg font-semibold hover:bg-red-600 transition-all"
                        >
                          Resolve NO
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default PredictionMarket;
