# CineFTP — বাংলা গাইড

FTP / HTTP open-directory সার্ভারের ফোল্ডার লিংক দিলে Netflix-এর মতো মুভি ও সিরিজ লাইব্রেরি দেখায়, পোস্টারসহ, আর নিজস্ব প্লেয়ারে চালানো যায়।

## ডাউনলোড ও ইনস্টল
1. [Releases](https://github.com/nurulislamtask/CineFTP-Releases/releases/latest) পেজে যাও।
2. **PC:** `CineFTP-Setup-….exe` ডাউনলোড করে ইনস্টল করো। Desktop-এ **CineFTP** শর্টকাট পাবে।
   *"Windows protected your PC"* দেখালে **More info → Run anyway** চাপো।
3. **ফোন:** `CineFTP-….apk` ডাউনলোড করে ইনস্টল করো ("Install unknown apps" allow করতে হবে)।

## সোর্স যোগ করা
**Settings → Sources → Add source** এ ফোল্ডারের লিংক বসাও, যেমন:
`http://172.16.50.14/DHAKA-FLIX-14/Hindi%20Movies/`
তারপর Sidebar থেকে সোর্স খোলো। বড় সার্ভারে প্রথমবার স্ক্যান করতে একটু সময় লাগে, পরের বার দ্রুত খোলে।

## অটো আপডেট (PC)
নতুন ভার্সন রিলিজ হলে অ্যাপ খুললে নোটিফিকেশন আর **Update now / Later** বক্স আসে। **Update now** দিলে নিজে ডাউনলোড হয়ে ইনস্টল হয় ও অ্যাপ আবার খোলে।
ফোনের APK নিজে আপডেট হয় না, Releases থেকে নতুন APK নামিয়ে ইনস্টল করতে হয়।

## নিজে নতুন আপডেট দিতে চাইলে
GitHub-এ ফাইল পরিবর্তন করে `main` branch-এ commit করলেই নতুন ইনস্টলার ও APK নিজে তৈরি হয়ে Releases-এ উঠে যায়। বিস্তারিত: [docs/RELEASING.md](docs/RELEASING.md)।
