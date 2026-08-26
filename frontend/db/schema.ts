import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const wishes = sqliteTable("wishes", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  votes: integer("votes").notNull().default(1),
  createdAt: integer("created_at").notNull(),
});
