-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    date_of_birth DATE NOT NULL,
    phone_number VARCHAR(20),
    profile_image_url TEXT,
    bio TEXT,
    handicap INTEGER,
    is_verified BOOLEAN DEFAULT FALSE,
    is_judge BOOLEAN DEFAULT FALSE,
    judge_rating DECIMAL(3,2) DEFAULT 0.00,
    total_disputes_judged INTEGER DEFAULT 0,
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    kyc_verified BOOLEAN DEFAULT FALSE,
    kyc_submitted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Wallet table
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    points_balance INTEGER DEFAULT 0 CHECK (points_balance >= 0),
    cash_balance DECIMAL(10,2) DEFAULT 0.00 CHECK (cash_balance >= 0.00),
    escrow_points INTEGER DEFAULT 0 CHECK (escrow_points >= 0),
    escrow_cash DECIMAL(10,2) DEFAULT 0.00 CHECK (escrow_cash >= 0.00),
    lifetime_points_earned INTEGER DEFAULT 0,
    lifetime_cash_earned DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Transactions table
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'purchase', 'bet_placed', 'bet_won', 'bet_lost', 'redeem', 'judge_fee', 'platform_fee'
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) NOT NULL, -- 'points' or 'usd'
    description TEXT,
    metadata JSONB,
    status VARCHAR(20) DEFAULT 'completed', -- 'pending', 'completed', 'failed', 'refunded'
    reference_id UUID, -- bet_id, purchase_id, etc.
    stripe_payment_intent_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bets table
CREATE TABLE bets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
    bet_code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    bet_type VARCHAR(50) NOT NULL, -- 'stroke', 'skins', 'match_play', 'custom'
    stake_amount INTEGER NOT NULL CHECK (stake_amount > 0),
    stake_currency VARCHAR(10) DEFAULT 'points', -- 'points' or 'cash'
    total_pot INTEGER DEFAULT 0,
    max_players INTEGER DEFAULT 4 CHECK (max_players >= 2 AND max_players <= 20),
    current_players INTEGER DEFAULT 1,
    location VARCHAR(255),
    course_name VARCHAR(255),
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    scheduled_start_time TIMESTAMP,
    actual_start_time TIMESTAMP,
    end_time TIMESTAMP,
    status VARCHAR(20) DEFAULT 'open', -- 'open', 'in_progress', 'completed', 'disputed', 'cancelled'
    is_public BOOLEAN DEFAULT FALSE,
    allow_outside_backers BOOLEAN DEFAULT FALSE,
    settings JSONB, -- custom game rules, scoring, etc.
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bet participants table
CREATE TABLE bet_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bet_id UUID REFERENCES bets(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    is_creator BOOLEAN DEFAULT FALSE,
    is_ready BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    final_score INTEGER,
    final_position INTEGER,
    payout_amount INTEGER DEFAULT 0,
    payout_received BOOLEAN DEFAULT FALSE,
    UNIQUE(bet_id, user_id)
);

-- Bet scores table (hole-by-hole tracking)
CREATE TABLE bet_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bet_id UUID REFERENCES bets(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES bet_participants(id) ON DELETE CASCADE,
    hole_number INTEGER NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
    par INTEGER NOT NULL,
    score INTEGER NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bet_id, participant_id, hole_number)
);

-- Outside bets (spectators betting on outcomes)
CREATE TABLE outside_bets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bet_id UUID REFERENCES bets(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    backed_participant_id UUID REFERENCES bet_participants(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK (amount > 0),
    currency VARCHAR(10) DEFAULT 'points',
    odds DECIMAL(5,2),
    potential_payout INTEGER,
    actual_payout INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'won', 'lost', 'refunded'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Disputes table
CREATE TABLE disputes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bet_id UUID REFERENCES bets(id) ON DELETE CASCADE,
    reported_by UUID REFERENCES users(id) ON DELETE CASCADE,
    reported_against UUID REFERENCES users(id),
    dispute_type VARCHAR(50) NOT NULL, -- 'score_disagreement', 'rule_violation', 'cheating', 'other'
    description TEXT NOT NULL,
    evidence_urls TEXT[],
    status VARCHAR(20) DEFAULT 'open', -- 'open', 'assigned', 'under_review', 'resolved', 'closed'
    assigned_judge_id UUID REFERENCES users(id),
    judge_decision TEXT,
    resolution TEXT,
    judge_fee INTEGER,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Social follows table
CREATE TABLE follows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    follower_id UUID REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(follower_id, following_id),
    CHECK (follower_id != following_id)
);

-- Achievements table
CREATE TABLE achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon_url TEXT,
    points_value INTEGER DEFAULT 0,
    rarity VARCHAR(20) DEFAULT 'common', -- 'common', 'rare', 'epic', 'legendary'
    criteria JSONB, -- conditions to earn
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User achievements table
CREATE TABLE user_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    achievement_id UUID REFERENCES achievements(id) ON DELETE CASCADE,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, achievement_id)
);

-- Store items table
CREATE TABLE store_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL, -- 'golf_gear', 'gift_card', 'merchandise', 'experience'
    brand VARCHAR(100),
    image_url TEXT,
    points_cost INTEGER NOT NULL CHECK (points_cost > 0),
    cash_value DECIMAL(10,2),
    stock_quantity INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Store orders table
CREATE TABLE store_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    item_id UUID REFERENCES store_items(id),
    quantity INTEGER DEFAULT 1,
    points_spent INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'fulfilled', 'cancelled'
    shipping_address JSONB,
    tracking_number VARCHAR(255),
    fulfilled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'bet_invite', 'bet_started', 'bet_completed', 'dispute_update', etc.
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_wallets_user_id ON wallets(user_id);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_bets_creator_id ON bets(creator_id);
CREATE INDEX idx_bets_status ON bets(status);
CREATE INDEX idx_bets_bet_code ON bets(bet_code);
CREATE INDEX idx_bets_created_at ON bets(created_at);
CREATE INDEX idx_bet_participants_bet_id ON bet_participants(bet_id);
CREATE INDEX idx_bet_participants_user_id ON bet_participants(user_id);
CREATE INDEX idx_bet_scores_bet_id ON bet_scores(bet_id);
CREATE INDEX idx_bet_scores_participant_id ON bet_scores(participant_id);
CREATE INDEX idx_disputes_bet_id ON disputes(bet_id);
CREATE INDEX idx_disputes_status ON disputes(status);
CREATE INDEX idx_follows_follower_id ON follows(follower_id);
CREATE INDEX idx_follows_following_id ON follows(following_id);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bets_updated_at BEFORE UPDATE ON bets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_disputes_updated_at BEFORE UPDATE ON disputes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_store_items_updated_at BEFORE UPDATE ON store_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_store_orders_updated_at BEFORE UPDATE ON store_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();