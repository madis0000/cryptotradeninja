CREATE TABLE "bot_cycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"bot_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"cycle_number" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"base_order_id" text,
	"take_profit_order_id" text,
	"active_order_ids" text[] DEFAULT '{}',
	"base_order_price" numeric(20, 8),
	"current_average_price" numeric(20, 8),
	"total_invested" numeric(20, 8) DEFAULT '0',
	"total_quantity" numeric(20, 8) DEFAULT '0',
	"cycle_profit" numeric(20, 8) DEFAULT '0',
	"filled_safety_orders" integer DEFAULT 0,
	"max_safety_orders" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cycle_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"cycle_id" integer NOT NULL,
	"bot_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"exchange_order_id" text,
	"client_order_id" text,
	"order_type" text NOT NULL,
	"safety_order_level" integer,
	"side" text NOT NULL,
	"order_category" text NOT NULL,
	"symbol" text NOT NULL,
	"quantity" numeric(20, 8) NOT NULL,
	"price" numeric(20, 8),
	"stop_price" numeric(20, 8),
	"status" text DEFAULT 'pending' NOT NULL,
	"filled_quantity" numeric(20, 8) DEFAULT '0',
	"filled_price" numeric(20, 8),
	"fee" numeric(20, 8) DEFAULT '0',
	"fee_asset" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"filled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "exchanges" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"api_key" text NOT NULL,
	"api_secret" text NOT NULL,
	"encryption_iv" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"ws_api_endpoint" text,
	"ws_stream_endpoint" text,
	"rest_api_endpoint" text,
	"exchange_type" text DEFAULT 'binance',
	"is_testnet" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"asset" text NOT NULL,
	"amount" numeric(20, 8) NOT NULL,
	"average_price" numeric(20, 8) NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"bot_id" integer,
	"user_id" integer NOT NULL,
	"exchange_order_id" text,
	"trading_pair" text NOT NULL,
	"side" text NOT NULL,
	"order_type" text NOT NULL,
	"order_category" text NOT NULL,
	"safety_order_level" integer,
	"amount" numeric(20, 8) NOT NULL,
	"quote_amount" numeric(20, 8) NOT NULL,
	"price" numeric(20, 8) NOT NULL,
	"status" text NOT NULL,
	"pnl" numeric(20, 8) DEFAULT '0' NOT NULL,
	"fee" numeric(20, 8) DEFAULT '0' NOT NULL,
	"fee_asset" text,
	"executed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_bots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"exchange_id" integer NOT NULL,
	"name" text NOT NULL,
	"strategy" text NOT NULL,
	"trading_pair" text NOT NULL,
	"direction" text NOT NULL,
	"base_order_amount" numeric(20, 8) NOT NULL,
	"safety_order_amount" numeric(20, 8) NOT NULL,
	"max_safety_orders" integer NOT NULL,
	"active_safety_orders_enabled" boolean DEFAULT false NOT NULL,
	"active_safety_orders" integer DEFAULT 1 NOT NULL,
	"price_deviation" numeric(10, 4) NOT NULL,
	"take_profit_percentage" numeric(10, 4) NOT NULL,
	"take_profit_type" text DEFAULT 'fix' NOT NULL,
	"trailing_profit_percentage" numeric(10, 4),
	"trigger_type" text DEFAULT 'market' NOT NULL,
	"trigger_price" numeric(20, 8),
	"price_deviation_multiplier" numeric(10, 2) DEFAULT '1.0' NOT NULL,
	"safety_order_size_multiplier" numeric(10, 2) DEFAULT '1.0' NOT NULL,
	"cooldown_between_rounds" integer DEFAULT 60 NOT NULL,
	"lower_price_limit" numeric(20, 8),
	"upper_price_limit" numeric(20, 8),
	"is_active" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'inactive' NOT NULL,
	"error_message" text,
	"current_base_price" numeric(20, 8),
	"average_entry_price" numeric(20, 8),
	"total_invested" numeric(20, 8) DEFAULT '0' NOT NULL,
	"total_pnl" numeric(20, 8) DEFAULT '0' NOT NULL,
	"total_trades" integer DEFAULT 0 NOT NULL,
	"win_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"sound_notifications_enabled" boolean DEFAULT true NOT NULL,
	"take_profit_sound_enabled" boolean DEFAULT true NOT NULL,
	"safety_order_sound_enabled" boolean DEFAULT true NOT NULL,
	"base_order_sound_enabled" boolean DEFAULT true NOT NULL,
	"take_profit_sound" text DEFAULT 'chin-chin' NOT NULL,
	"safety_order_sound" text DEFAULT 'beep' NOT NULL,
	"base_order_sound" text DEFAULT 'notification' NOT NULL,
	"notification_volume" numeric(3, 2) DEFAULT '0.50' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
