-- Insert sample achievements
INSERT INTO achievements (name, description, icon_url, points_value, rarity, criteria) VALUES
('First Bet', 'Place your first bet', 'https://example.com/icons/first-bet.png', 50, 'common', '{"bets_placed": 1}'),
('Winner', 'Win your first bet', 'https://example.com/icons/winner.png', 100, 'common', '{"bets_won": 1}'),
('Hot Streak', 'Win 3 bets in a row', 'https://example.com/icons/hot-streak.png', 500, 'rare', '{"consecutive_wins": 3}'),
('Eagle Eye', 'Score an eagle in a bet', 'https://example.com/icons/eagle.png', 250, 'rare', '{"eagles": 1}'),
('Century Club', 'Play 100 bets', 'https://example.com/icons/century.png', 1000, 'epic', '{"bets_played": 100}'),
('Social Butterfly', 'Follow 50 players', 'https://example.com/icons/social.png', 200, 'common', '{"follows": 50}'),
('Big Spender', 'Spend 10,000 points in the store', 'https://example.com/icons/big-spender.png', 500, 'rare', '{"points_spent": 10000}'),
('Judge Jury', 'Resolve 10 disputes', 'https://example.com/icons/judge.png', 1000, 'epic', '{"disputes_resolved": 10}'),
('Birdie Master', 'Score 50 birdies', 'https://example.com/icons/birdie.png', 750, 'rare', '{"birdies": 50}'),
('Legendary', 'Win 1000 bets', 'https://example.com/icons/legendary.png', 10000, 'legendary', '{"bets_won": 1000}')
ON CONFLICT (name) DO NOTHING;

-- Insert sample store items
INSERT INTO store_items (name, description, category, brand, image_url, points_cost, cash_value, stock_quantity, is_active) VALUES
-- Golf Gear
('Premium Golf Balls (Dozen)', 'Titleist Pro V1 golf balls', 'golf_gear', 'Titleist', 'https://example.com/items/prov1.jpg', 5000, 49.99, 100, true),
('Golf Glove', 'Callaway Weather Spann glove', 'golf_gear', 'Callaway', 'https://example.com/items/glove.jpg', 2500, 24.99, 50, true),
('Golf Tees (Pack of 100)', 'Wooden golf tees', 'golf_gear', 'Generic', 'https://example.com/items/tees.jpg', 500, 4.99, 200, true),
('Divot Tool', 'Premium divot repair tool', 'golf_gear', 'Scotty Cameron', 'https://example.com/items/divot.jpg', 3000, 29.99, 75, true),
('Golf Towel', 'Microfiber golf towel', 'golf_gear', 'Nike', 'https://example.com/items/towel.jpg', 1500, 14.99, 100, true),

-- Gift Cards
('$10 Amazon Gift Card', 'Redeemable on Amazon.com', 'gift_card', 'Amazon', 'https://example.com/items/amazon-10.jpg', 1000, 10.00, 1000, true),
('$25 Amazon Gift Card', 'Redeemable on Amazon.com', 'gift_card', 'Amazon', 'https://example.com/items/amazon-25.jpg', 2500, 25.00, 1000, true),
('$50 Amazon Gift Card', 'Redeemable on Amazon.com', 'gift_card', 'Amazon', 'https://example.com/items/amazon-50.jpg', 5000, 50.00, 1000, true),
('$10 Starbucks Gift Card', 'Redeemable at Starbucks', 'gift_card', 'Starbucks', 'https://example.com/items/starbucks-10.jpg', 1000, 10.00, 500, true),
('$25 iTunes Gift Card', 'Redeemable on iTunes/App Store', 'gift_card', 'Apple', 'https://example.com/items/itunes-25.jpg', 2500, 25.00, 500, true),

-- Merchandise
('FriendlyWager Hat', 'Embroidered logo cap', 'merchandise', 'FriendlyWager', 'https://example.com/items/hat.jpg', 3500, 34.99, 50, true),
('FriendlyWager Polo', 'Premium polo shirt', 'merchandise', 'FriendlyWager', 'https://example.com/items/polo.jpg', 7500, 74.99, 30, true),
('FriendlyWager Ball Marker', 'Magnetic ball marker', 'merchandise', 'FriendlyWager', 'https://example.com/items/marker.jpg', 1000, 9.99, 100, true),

-- Experiences
('Private Golf Lesson', '1-hour lesson with a pro', 'experience', 'Various', 'https://example.com/items/lesson.jpg', 15000, 150.00, 10, true),
('Round at Premium Course', 'Play at a top-rated course', 'experience', 'Various', 'https://example.com/items/premium-round.jpg', 25000, 250.00, 5, true)
ON CONFLICT DO NOTHING;

-- Create logs directory if needed (this is for the application)
-- The application will create this automatically when it starts

COMMIT;

-- Display summary
SELECT 'Seed data loaded successfully!' as status;
SELECT COUNT(*) as achievements_count FROM achievements;
SELECT COUNT(*) as store_items_count FROM store_items;