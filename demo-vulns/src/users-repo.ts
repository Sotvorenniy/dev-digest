interface Db {
  query(sql: string): Promise<unknown[]>;
}

export async function findUserByName(db: Db, name: string) {
  return db.query("SELECT id, email, role FROM users WHERE name = '" + name + "'");
}

export async function searchUsers(db: Db, term: string, orderBy: string) {
  return db.query(`SELECT id, name FROM users WHERE name LIKE '%${term}%' ORDER BY ${orderBy}`);
}
