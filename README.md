# ClubLog

社内部活動の活動登録・記録・日程調整を行うスマートフォン向けプロトタイプです。

## 起動

`index.html` をブラウザで開くと動きます。デモログインは以下です。

- 社員ID: `E1001`
- パスワード: `demo123`

## 実装済み

- 社員ID / パスワードのデモログイン
- 名前、所属事業部、所属店舗、所属部活の登録
- 複数部活への所属
- 活動記録の投稿、写真添付、一覧閲覧
- 次回活動日の候補追加
- 参加 / 未定 / 不参加の回答
- 部活所属者への通知予定表示
- SmartHR 社員情報同期の差し替え口

## SmartHR 連携方針

SmartHR API のアクセストークンはフロントエンドに置かず、サーバー側で保持する想定です。

1. アプリから自社バックエンドの `/api/integrations/smarthr/employees` を呼ぶ
2. バックエンドが `https://{tenant}.smarthr.jp/api` に Bearer トークン付きでアクセスする
3. 取得した社員情報をアプリ用のユーザーデータへ変換する
4. 退職者、休職者、店舗変更などの同期ルールをバックエンドで管理する

SmartHR API 公式ドキュメント: https://developer.smarthr.jp/api/about_api

## Firebase

登録データは Firebase の設定を入れると Firestore に保存されます。
設定が空の間は、これまで通り `localStorage` に保存されます。

1. Firebase Console で Web アプリを追加する
2. Firestore Database を作成する
3. `firebase-config.js` に Web アプリ設定を貼り付ける
4. Firestore Rules に開発用ルールを設定する

開発用の最小ルール例です。公開URLで使う場合は必ず認証付きルールに変更してください。

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /clublog/appState {
      allow read, write: if true;
    }
  }
}
```

現在のプロトタイプでは `clublog/appState` の1ドキュメントにまとめて保存します。
本番運用では、ユーザー・部活・活動記録・日程をコレクション分割し、写真は Firebase Storage に分ける設計がおすすめです。
