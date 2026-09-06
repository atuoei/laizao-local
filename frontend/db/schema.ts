import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const wishes = sqliteTable("wishes", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  votes: integer("votes").notNull().default(1),
  actorId: text("actor_id"),
  createdAt: integer("created_at").notNull(),
});

export const wishVotes = sqliteTable("wish_votes", {
  id: text("id").primaryKey(),
  wishId: text("wish_id").notNull().references(() => wishes.id),
  actorId: text("actor_id").notNull(),
  createdAt: integer("created_at").notNull(),
}, table => [uniqueIndex("uq_wish_votes_wish_actor").on(table.wishId, table.actorId)]);

export const needAnalyses = sqliteTable("need_analyses", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  message: text("message").notNull(),
  answers: text("answers").notNull(),
  supplement: text("supplement").notNull(),
  analysis: text("analysis").notNull(),
  source: text("source").notNull(),
  createdAt: integer("created_at").notNull(),
});
