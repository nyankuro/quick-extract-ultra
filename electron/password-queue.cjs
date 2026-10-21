class PasswordQueue {
  constructor() {
    this.waiting = new Map();
    this.passwords = new Map();
    this.wake = null;
  }

  add(archive) {
    this.waiting.set(archive.id, archive);
  }

  submit(id, password) {
    if (!this.waiting.has(id)) throw new Error('This archive is not waiting for a password.');
    if (typeof password !== 'string' || !password || /[\r\n\0]/.test(password)) {
      throw new Error('Enter a non-empty, single-line password.');
    }
    this.passwords.set(id, password);
    this.wake?.();
  }

  skip(id) {
    if (!this.waiting.has(id)) throw new Error('This archive is not waiting for a password.');
    this.waiting.delete(id);
    this.passwords.delete(id);
    this.wake?.();
  }

  async next() {
    while (this.waiting.size) {
      for (const [id, archive] of this.waiting) {
        if (this.passwords.has(id)) {
          const password = this.passwords.get(id);
          this.passwords.delete(id);
          this.waiting.delete(id);
          return { archive, password };
        }
      }
      await new Promise((resolve) => { this.wake = resolve; });
      this.wake = null;
    }
    return null;
  }
}

module.exports = { PasswordQueue };
