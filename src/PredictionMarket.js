import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Plus, Coins, RefreshCw, Sparkles, Trophy, Clock, Activity } from 'lucide-react';

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

  // Inline styles for beautiful UI
  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #581c87 50%, #0f172a 100%)',
      padding: '2rem',
      position: 'relative',
      overflow: 'hidden',
    },
    backgroundOrb1: {
      position: 'fixed',
      top: '10%',
      left: '20%',
      width: '400px',
      height: '400px',
      background: 'rgba(168, 85, 247, 0.2)',
      borderRadius: '50%',
      filter: 'blur(80px)',
      animation: 'float 8s ease-in-out infinite',
      pointerEvents: 'none',
    },
    backgroundOrb2: {
      position: 'fixed',
      bottom: '20%',
      right: '20%',
      width: '300px',
      height: '300px',
      background: 'rgba(236, 72, 153, 0.2)',
      borderRadius: '50%',
      filter: 'blur(80px)',
      animation: 'float 8s ease-in-out infinite',
      animationDelay: '4s',
      pointerEvents: 'none',
    },
    glassCard: {
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      background: 'rgba(255, 255, 255, 0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      borderRadius: '24px',
      boxShadow: '0 0 40px rgba(168, 85, 247, 0.3)',
      padding: '1.5rem',
      marginBottom: '1.5rem',
      transition: 'all 0.3s ease',
    },
    title: {
      fontSize: '1.875rem',
      fontWeight: '700',
      background: 'linear-gradient(135deg, #fff 0%, #e9d5ff 50%, #fbcfe8 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    },
    subtitle: {
      color: 'rgba(196, 181, 253, 0.8)',
      marginLeft: '3.5rem',
    },
    userInfo: {
      backdropFilter: 'blur(10px)',
      background: 'rgba(255, 255, 255, 0.05)',
      padding: '1rem 1.25rem',
      borderRadius: '16px',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      textAlign: 'right',
    },
    coinIcon: {
      background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
      padding: '0.25rem',
      borderRadius: '8px',
      display: 'inline-flex',
    },
    balanceAmount: {
      fontWeight: '700',
      fontSize: '1.125rem',
      background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    },
    btnPrimary: {
      background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
      color: 'white',
      padding: '0.75rem 1.5rem',
      borderRadius: '12px',
      fontWeight: '600',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      boxShadow: '0 10px 30px rgba(168, 85, 247, 0.3)',
      transition: 'all 0.3s ease',
    },
    btnSecondary: {
      background: 'rgba(255, 255, 255, 0.1)',
      color: 'white',
      padding: '0.75rem',
      borderRadius: '12px',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
    },
    yesCard: {
      background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(34, 197, 94, 0.1) 100%)',
      border: '1px solid rgba(16, 185, 129, 0.3)',
      borderRadius: '16px',
      padding: '1rem',
      transition: 'all 0.3s ease',
    },
    noCard: {
      background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.2) 0%, rgba(239, 68, 68, 0.1) 100%)',
      border: '1px solid rgba(244, 63, 94, 0.3)',
      borderRadius: '16px',
      padding: '1rem',
      transition: 'all 0.3s ease',
    },
    betBtnYes: {
      flex: 1,
      background: 'rgba(16, 185, 129, 0.3)',
      color: '#a7f3d0',
      border: '1px solid rgba(16, 185, 129, 0.3)',
      padding: '0.5rem',
      borderRadius: '12px',
      fontSize: '0.875rem',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    },
    betBtnNo: {
      flex: 1,
      background: 'rgba(244, 63, 94, 0.3)',
      color: '#fecdd3',
      border: '1px solid rgba(244, 63, 94, 0.3)',
      padding: '0.5rem',
      borderRadius: '12px',
      fontSize: '0.875rem',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    },
    betInput: {
      flex: 1,
      padding: '0.5rem 0.75rem',
      background: 'rgba(255, 255, 255, 0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      borderRadius: '12px',
      color: 'white',
      fontSize: '0.875rem',
    },
    betSubmitYes: {
      padding: '0.5rem 1rem',
      background: 'linear-gradient(135deg, #10b981 0%, #22c55e 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      fontWeight: '600',
      cursor: 'pointer',
      boxShadow: '0 5px 20px rgba(16, 185, 129, 0.3)',
    },
    betSubmitNo: {
      padding: '0.5rem 1rem',
      background: 'linear-gradient(135deg, #f43f5e 0%, #ef4444 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      fontWeight: '600',
      cursor: 'pointer',
      boxShadow: '0 5px 20px rgba(244, 63, 94, 0.3)',
    },
    activityItem: {
      background: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '12px',
      padding: '0.75rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '0.5rem',
    },
    positionCard: {
      background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%)',
      border: '1px solid rgba(168, 85, 247, 0.3)',
      borderRadius: '16px',
      padding: '1rem',
      marginBottom: '1rem',
    },
    resolveBtn: {
      flex: 1,
      padding: '0.75rem',
      borderRadius: '12px',
      fontWeight: '600',
      border: 'none',
      cursor: 'pointer',
      color: 'white',
    },
    inputField: {
      width: '100%',
      padding: '0.75rem 1rem',
      background: 'rgba(255, 255, 255, 0.1)',
      border: '2px solid rgba(255, 255, 255, 0.2)',
      borderRadius: '12px',
      color: 'white',
      marginBottom: '1rem',
      fontSize: '1rem',
      boxSizing: 'border-box',
    },
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div style={{ textAlign: 'center' }}>
          <div className="loading-spinner">
            <div className="loading-glow"></div>
            <RefreshCw style={{ width: '64px', height: '64px', color: '#a855f7', animation: 'spin 1s linear infinite', position: 'relative', zIndex: 10, margin: '0 auto 1.5rem' }} />
          </div>
          <p style={{ color: '#e9d5ff', fontWeight: '600', fontSize: '1.125rem', letterSpacing: '0.025em' }}>Loading markets...</p>
          <div className="loading-dots">
            <span className="loading-dot"></span>
            <span className="loading-dot"></span>
            <span className="loading-dot"></span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="prediction-market" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...styles.glassCard, maxWidth: '28rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3.75rem', marginBottom: '1.5rem' }}>⚠️</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'white', marginBottom: '0.75rem' }}>Connection Error</h2>
          <p style={{ color: '#e9d5ff', marginBottom: '1.5rem' }}>{error}</p>
          <div style={{ textAlign: 'left', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255, 255, 255, 0.1)', marginBottom: '1.5rem' }}>
            <p style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#d8b4fe' }}>Troubleshooting:</p>
            <ol style={{ listStyleType: 'decimal', paddingLeft: '1.5rem', color: '#e9d5ff' }}>
              <li style={{ marginBottom: '0.5rem' }}>Check that your Supabase project is running</li>
              <li style={{ marginBottom: '0.5rem' }}>Verify the API URL and key are correct</li>
              <li style={{ marginBottom: '0.5rem' }}>Ensure the tables exist: users, markets, bids</li>
              <li>Check that RLS policies allow anonymous access</li>
            </ol>
          </div>
          <button
            onClick={() => window.location.reload()}
            style={styles.btnPrimary}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="prediction-market" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...styles.glassCard, textAlign: 'center' }}>
          <p style={{ color: '#e9d5ff', fontWeight: '600', fontSize: '1.125rem' }}>Error loading user. Please refresh the page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="prediction-market">
      {/* Animated background orbs */}
      <div style={styles.backgroundOrb1}></div>
      <div style={styles.backgroundOrb2}></div>
      
      <div style={{ maxWidth: '72rem', margin: '0 auto', position: 'relative', zIndex: 10 }}>
        {/* Header Card */}
        <div className="glass-card" style={styles.glassCard}>
          <div className="market-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <div style={{ padding: '0.5rem', background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)', borderRadius: '12px', boxShadow: '0 10px 30px rgba(168, 85, 247, 0.3)' }}>
                  <Sparkles style={{ width: '24px', height: '24px', color: 'white' }} />
                </div>
                <h1 style={styles.title}>Family Prediction Market</h1>
              </div>
              <p style={styles.subtitle}>Make predictions with play money!</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={styles.userInfo}>
                <p style={{ fontSize: '0.75rem', color: 'rgba(196, 181, 253, 0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Playing as</p>
                <p style={{ fontWeight: '600', color: 'white' }}>{currentUser.name}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <span style={styles.coinIcon}>
                    <Coins style={{ width: '16px', height: '16px', color: 'white' }} />
                  </span>
                  <span style={styles.balanceAmount}>{currentUser.balance}</span>
                </div>
              </div>
              <button
                onClick={loadMarkets}
                style={styles.btnSecondary}
                title="Refresh"
              >
                <RefreshCw style={{ width: '20px', height: '20px', color: '#d8b4fe' }} />
              </button>
              <button
                onClick={() => setShowCreateMarket(!showCreateMarket)}
                style={styles.btnPrimary}
              >
                <Plus style={{ width: '20px', height: '20px' }} />
                New Market
              </button>
            </div>
          </div>
        </div>

        {showCreateMarket && (
          <div className="glass-card" style={styles.glassCard}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'white', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles style={{ width: '20px', height: '20px', color: '#a855f7' }} />
              Create New Prediction
            </h2>
            <input
              type="text"
              placeholder="What will happen? (e.g., Will it snow on Christmas?)"
              value={newMarket.question}
              onChange={(e) => setNewMarket({ ...newMarket, question: e.target.value })}
              style={styles.inputField}
            />
            <input
              type="date"
              value={newMarket.endDate}
              onChange={(e) => setNewMarket({ ...newMarket, endDate: e.target.value })}
              style={styles.inputField}
            />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={createMarket}
                style={{ ...styles.btnPrimary, flex: 1, justifyContent: 'center' }}
              >
                Create Market
              </button>
              <button
                onClick={() => setShowCreateMarket(false)}
                style={{ padding: '0.75rem 1.5rem', border: '2px solid rgba(255, 255, 255, 0.2)', borderRadius: '12px', fontWeight: '600', color: 'white', background: 'transparent', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {markets.length === 0 ? (
            <div className="glass-card" style={{ ...styles.glassCard, padding: '3rem', textAlign: 'center' }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)', borderRadius: '50%', filter: 'blur(30px)', opacity: 0.2 }}></div>
                <TrendingUp style={{ width: '80px', height: '80px', color: 'rgba(168, 85, 247, 0.5)', margin: '0 auto 1.5rem', position: 'relative', zIndex: 10 }} />
              </div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: '600', color: 'white', marginBottom: '0.5rem' }}>No markets yet!</h3>
              <p style={{ color: 'rgba(196, 181, 253, 0.7)' }}>Create your first prediction to get started</p>
            </div>
          ) : (
            markets.map(market => {
              const yesPrice = calculatePrice(market.yes_shares, market.no_shares);
              const noPrice = 100 - yesPrice;

              return (
                <div key={market.id} className="glass-card" style={styles.glassCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'white', flex: 1 }}>{market.question}</h3>
                    {market.resolved && (
                      <span style={{ marginLeft: '1rem', padding: '0.375rem 1rem', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(34, 197, 94, 0.2) 100%)', color: '#6ee7b7', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                        <Trophy style={{ width: '16px', height: '16px' }} />
                        Resolved: {market.outcome === 'yes' ? 'YES' : 'NO'}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'rgba(196, 181, 253, 0.7)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Clock style={{ width: '16px', height: '16px' }} />
                    Ends: {new Date(market.end_date).toLocaleDateString()}
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                    {/* YES Card */}
                    <div style={styles.yesCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <span style={{ fontWeight: '700', color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.875rem' }}>YES</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <TrendingUp style={{ width: '20px', height: '20px', color: '#34d399' }} />
                          <span style={{ fontSize: '1.875rem', fontWeight: '700', color: '#6ee7b7' }}>{yesPrice}%</span>
                        </div>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'rgba(52, 211, 153, 0.7)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Activity style={{ width: '12px', height: '12px' }} />
                        Pool: {Math.round(market.yes_shares)} shares
                      </div>
                      {!market.resolved && (
                        <>
                          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            {[10, 25, 50, 100].map(amount => (
                              <button
                                key={amount}
                                onClick={() => placeBid(market.id, 'yes', amount)}
                                style={styles.betBtnYes}
                              >
                                {amount}
                              </button>
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                              type="number"
                              placeholder="Custom"
                              value={customBets[market.id] || ''}
                              onChange={(e) => setCustomBets({ ...customBets, [market.id]: e.target.value })}
                              style={styles.betInput}
                            />
                            <button
                              onClick={() => placeBid(market.id, 'yes', parseInt(customBets[market.id]) || 0)}
                              style={styles.betSubmitYes}
                            >
                              Bet
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    {/* NO Card */}
                    <div style={styles.noCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <span style={{ fontWeight: '700', color: '#fda4af', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.875rem' }}>NO</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <TrendingDown style={{ width: '20px', height: '20px', color: '#fb7185' }} />
                          <span style={{ fontSize: '1.875rem', fontWeight: '700', color: '#fda4af' }}>{noPrice}%</span>
                        </div>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'rgba(251, 113, 133, 0.7)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Activity style={{ width: '12px', height: '12px' }} />
                        Pool: {Math.round(market.no_shares)} shares
                      </div>
                      {!market.resolved && (
                        <>
                          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            {[10, 25, 50, 100].map(amount => (
                              <button
                                key={amount}
                                onClick={() => placeBid(market.id, 'no', amount)}
                                style={styles.betBtnNo}
                              >
                                {amount}
                              </button>
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                              type="number"
                              placeholder="Custom"
                              value={customBets[market.id] || ''}
                              onChange={(e) => setCustomBets({ ...customBets, [market.id]: e.target.value })}
                              style={styles.betInput}
                            />
                            <button
                              onClick={() => placeBid(market.id, 'no', parseInt(customBets[market.id]) || 0)}
                              style={styles.betSubmitNo}
                            >
                              Bet
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {market.bids.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <h4 style={{ fontWeight: '600', color: '#d8b4fe', marginBottom: '0.75rem', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Activity style={{ width: '16px', height: '16px' }} />
                        Recent Activity
                      </h4>
                      <div style={{ maxHeight: '128px', overflowY: 'auto' }}>
                        {market.bids.slice(0, 5).map((bid, idx) => (
                          <div key={idx} style={styles.activityItem}>
                            <div style={{ color: '#e9d5ff', fontSize: '0.875rem' }}>
                              <span style={{ fontWeight: '600', color: 'white' }}>{bid.user_name}</span> bet{' '}
                              <span style={{ fontWeight: '600', color: '#fbbf24' }}>{bid.amount}</span> on{' '}
                              <span style={{ fontWeight: '600', color: bid.position === 'yes' ? '#34d399' : '#fb7185' }}>
                                {bid.position.toUpperCase()}
                              </span>
                            </div>
                            {bid.created_at && (
                              <span style={{ fontSize: '0.75rem', color: 'rgba(168, 85, 247, 0.5)' }}>
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
                        <div style={styles.positionCard}>
                          <h4 style={{ fontWeight: '600', color: '#e9d5ff', fontSize: '0.875rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Position</h4>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.875rem' }}>
                            {yesBets > 0 && (
                              <span style={{ color: '#6ee7b7', background: 'rgba(16, 185, 129, 0.2)', padding: '0.25rem 0.75rem', borderRadius: '8px' }}>YES: <span style={{ fontWeight: '600' }}>{yesBets} coins</span></span>
                            )}
                            {noBets > 0 && (
                              <span style={{ color: '#fda4af', background: 'rgba(244, 63, 94, 0.2)', padding: '0.25rem 0.75rem', borderRadius: '8px' }}>NO: <span style={{ fontWeight: '600' }}>{noBets} coins</span></span>
                            )}
                            <span style={{ color: '#e9d5ff', background: 'rgba(168, 85, 247, 0.2)', padding: '0.25rem 0.75rem', borderRadius: '8px' }}>Total: <span style={{ fontWeight: '600', color: '#fbbf24' }}>{yesBets + noBets}</span></span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {!market.resolved && new Date(market.end_date) <= new Date() && (
                    <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      <button
                        onClick={() => resolveMarket(market.id, 'yes')}
                        style={{ ...styles.resolveBtn, background: 'linear-gradient(135deg, #10b981 0%, #22c55e 100%)', boxShadow: '0 10px 30px rgba(16, 185, 129, 0.3)' }}
                      >
                        Resolve YES
                      </button>
                      <button
                        onClick={() => resolveMarket(market.id, 'no')}
                        style={{ ...styles.resolveBtn, background: 'linear-gradient(135deg, #f43f5e 0%, #ef4444 100%)', boxShadow: '0 10px 30px rgba(244, 63, 94, 0.3)' }}
                      >
                        Resolve NO
                      </button>
                    </div>
                  )}
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
