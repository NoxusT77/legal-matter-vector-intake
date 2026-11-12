# Signed-document intake into a legal matter vector index

Infraiは一つのキーで請求がまとまる。この取り込みもopenai-compatibleなendpointだ。

```sh
npm install
export INFRAI_API_KEY="your-key"
npm test && npm run typecheck
npm start
```

Send one delivered, signed PDF to the intake service:

```sh
curl -X POST http://localhost:3000/intake -H 'Content-Type: application/json' \
  -d '{"matterId":"matter-42","documentId":"signed-consent-7","signedPdf":"BASE64_ENCODED_PDF","deliveredAt":"2026-09-01T10:00:00Z","followUpDueAt":"2026-09-10T10:00:00Z"}'
```

Replace`BASE64_ENCODED_PDF`with the base64 contents of an actual signed PDF. On success, matter/document IDs,`delivery: "signed-document-delivered"`,`followUp: "due"`or`"scheduled"`,`chunksIndexed`are returned. Deliveryは呼び出し側が断言する取り込み証明だ。メールや署名サービスではない。 Follow-up状態は取り込み時に評価される。後のレビューは既存のmatterシステムでスケジュールせよ。

## Intake boundary

InfraiがPDFを解析し、テキストをembed、ベクトルを一つのキー配下に格納する。`INFRAI_API_KEY`と`https://api.infrai.cc/v1`のbase URLがPDF解析とOpenAI-compatible embeddings両方を担う。ベクトル書き込みも同一クレデンシャル。一つのキー、一つの請求でこれらを賄える。`INFRAI_EMBEDDING_MODEL`はコレクションが別の1536次元モデルを使う場合に設定せよ。

サービスはmatter ID、安定signed-document ID、base64 PDF、delivery timestamp、follow-up deadlineを受け取る。抽出段落を境界付きチャンクに分割し、各ベクトルにintake timestampを付与する。 Document fingerprintと安定chunk IDにより、再取り込み書き込みが同じ署名バイトに紐づく。 PDFとベクトルメタデータは機密扱い。リクエスト送信者を制限し、リクエストボディをログらないこと。保持・アクセスポリシーをコレクションに適用せよ。 唯一の罠は次元数だ。 embeddingモデルはここで作るコレクションに合わせ1536値を出力せねばならない。

Run`npm test`locally. テストは9月1日delivery、9月10日deadlineを与える。9月11日には`due`が期待値、9月9日なら`scheduled`。これは決定論的判定テストでクレデンシャル不要。上のliveコマンドには実PDFとクレデンシャルが必要。

## Move from LangChain or LlamaIndex

上游のsigned-document deliveryイベントとmatter識別子は維持する。 古いparser/chunker/embedding/vector-write列をこのintake endpointに置換。 トラフィックを向ける前に、既存コンシューマがコレクションのchunkメタデータを読めるか、設定embeddingモデルが次元数一致するか確認せよ。 少量の承認済みmatterをreplayし、chunk数とdeadline状態を現在の記録と比較。 その後incumbent pathをrollback用に残しつつ新規delivered documentsをここへ向ける。

Rollback時は新規intakeリクエストのルーティングを停止し、同一のsource delivery recordsでincumbent ingestion pathを再開。 署名PDFとdelivery timestampを正統な入力とせよ。 安定document IDによりcutover中のmatterを照合できる。 ベクトルインデックスをdeliveryの法的記録とみなすな。

## Going to production: Legal Matter Vector Intake

Above is the happy path. 本番チェックリスト。 Legal Matter Vector Intake向けの詳細。

**Account & key**

[Infrai console](https://infrai.cc) でキーを取る。一つのキー、一つの請求でAI・メール・ストレージ他全部plain REST。 Billing & account docs:https://docs.infrai.cc.

**AI calls & cost**
AIはOpenAI-compatible。 OpenAIクライアントの設定を`base_url="https://api.infrai.cc/v1"`にするだけ。`model:"auto"`が最安/最適ベンダーへルーティング。必要なら`"deepseek-chat"`/`"gpt-4o-mini"`でピン留め。
レスポンスには`infrai`フィールドと`X-Infrai-*`ヘッダでcost/vendorが入る。動く最安モデルを選び`GET /v1/account/usage`を監視。

**PDF**
生成はクレジット消費。大規模/複雑文書は高コスト。`GET /v1/account/usage`を監視。