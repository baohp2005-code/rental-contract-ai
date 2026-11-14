import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      // Test dùng lại dữ liệu mẫu của app; file đó require() ảnh .jpg cho Expo.
      // Trong Node thay bằng số giả.
      name: 'stub-image-requires',
      transform(code, id) {
        if (!id.includes('/mobile/src/mocks/')) return null;
        return code.replace(/require\((['"])[^'"]+\.(?:jpe?g|png)\1\)/g, '0');
      },
    },
  ],
});
