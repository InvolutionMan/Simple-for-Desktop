import AppKit
import AVKit
import SwiftUI

private enum FollowingTab: String, CaseIterable, Identifiable {
    case following
    case plaza
    case discover

    var id: String { rawValue }

    var title: String {
        switch self {
        case .following: return "关注"
        case .plaza: return "广场"
        case .discover: return "发现"
        }
    }

    var emptyTitle: String {
        switch self {
        case .following: return "还没有关注动态"
        case .plaza: return "广场还没有内容"
        case .discover: return "发现还没有内容"
        }
    }

    var emptyCopy: String {
        switch self {
        case .following: return "关注的人发布内容后，会出现在这里。"
        case .plaza: return "这里会显示广场里的新动态。"
        case .discover: return "这里会显示发现里的内容。"
        }
    }

    var storeTab: FollowingStore.Tab {
        switch self {
        case .following: return .following
        case .plaza: return .plaza
        case .discover: return .discover
        }
    }
}

struct FollowingView: View {
    /// `FollowingView` 在侧栏右侧，用它来对齐标题栏里的浮动内容。
    let leadingChromeWidth: CGFloat
    @ObservedObject var store: FollowingStore

    @State private var selectedTab: FollowingTab = .following
    @State private var showingPublishNotice = false
    @State private var searchText = ""
    @State private var commentingPost: FeedPost?
    @State private var previewURL: URL?
    @State private var playingVideo: URL?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            content
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.surface)
        .animation(.easeInOut(duration: 0.2), value: selectedTab)
        .alert("发布动态", isPresented: $showingPublishNotice) {
            Button("知道了", role: .cancel) { }
        } message: {
            Text("发布编辑器会在接入发布接口后开放。")
        }
        .sheet(item: $commentingPost) { post in
            CommentsSheet(post: post, store: store)
        }
        .overlay {
            if let previewURL {
                ImagePreview(url: previewURL) {
                    withAnimation(.easeOut(duration: 0.16)) { self.previewURL = nil }
                }
                .transition(.opacity)
                .zIndex(10)
            }

            if let playingVideo {
                VideoOverlay(url: playingVideo) {
                    withAnimation(.easeOut(duration: 0.16)) { self.playingVideo = nil }
                }
                .zIndex(11)
            }
        }
        .task(id: selectedTab) {
            await store.load(tab: selectedTab.storeTab)
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 0) {
            ZStack {
                HStack(alignment: .center, spacing: 24) {
                    SimpleMark(circle: Theme.ink, bars: Theme.surface)
                        .frame(width: 24, height: 24)

                    tabButtons

                    Spacer(minLength: 24)

                    PublishButton {
                        showingPublishNotice = true
                    }
                }

                searchField
                    .offset(x: -leadingChromeWidth / 2)
            }
            .padding(.horizontal, 40)
            .frame(height: 56)

            Rectangle()
                .fill(Theme.line)
                .frame(height: 1)
        }
        .frame(maxWidth: .infinity)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.muted)

            TextField("", text: $searchText, prompt: Text("搜索").foregroundColor(Theme.faint))
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .foregroundStyle(Theme.ink)
                .accessibilityLabel("搜索")
        }
        .padding(.horizontal, 12)
        .frame(width: 300, height: 32)
        .background(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(Theme.paper)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .strokeBorder(Theme.line, lineWidth: 1)
        )
    }

    private var tabButtons: some View {
        HStack(spacing: 30) {
            ForEach(FollowingTab.allCases) { tab in
                Button {
                    selectedTab = tab
                } label: {
                    Text(tab.title)
                        .font(.system(size: 15, weight: selectedTab == tab ? .semibold : .regular))
                        .foregroundStyle(selectedTab == tab ? Theme.ink : Theme.muted)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selectedTab == tab ? [.isSelected] : [])
            }
        }
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if selectedTab == .discover {
            emptyTab
        } else if store.isLoading && store.posts.isEmpty {
            loadingState
        } else if store.posts.isEmpty {
            emptyTab
        } else {
            postFeed
        }
    }

    private var loadingState: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 24)
            ProgressView()
                .controlSize(.small)
            Spacer(minLength: 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyTab: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 24)
            emptyState
            Spacer(minLength: 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var postFeed: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                ForEach(store.posts) { post in
                    PostCard(
                        post: post,
                        onComment: { commentingPost = post },
                        onLike: { Task { await store.toggleVote(on: post) } },
                        onTapImage: { url in
                            withAnimation(.easeOut(duration: 0.16)) { previewURL = url }
                        },
                        onTapVideo: { url in
                            withAnimation(.easeOut(duration: 0.16)) { playingVideo = url }
                        }
                    )
                    .frame(maxWidth: 620)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 40)
                }

                footer
                    .frame(maxWidth: 620)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 40)
            }
            .padding(.top, 28)
            .padding(.bottom, 32)
        }
        .scrollIndicators(.hidden)
    }

    @ViewBuilder
    private var footer: some View {
        if store.isLoadingMore {
            ProgressView()
                .controlSize(.small)
                .padding(.vertical, 18)
        } else if !store.canLoadMore && !store.posts.isEmpty {
            Text("没有更多了")
                .font(.system(size: 12))
                .foregroundStyle(Theme.faint)
                .padding(.vertical, 18)
        } else {
            Color.clear
                .frame(height: 1)
                .onAppear {
                    Task { await store.loadMore(tab: selectedTab.storeTab) }
                }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 0) {
            ZStack {
                Circle()
                    .fill(Theme.tealSoft)
                    .frame(width: 72, height: 72)

                SimpleMark(circle: Theme.ink, bars: Theme.tealSoft)
                    .frame(width: 30, height: 30)
            }

            Text(selectedTab.emptyTitle)
                .font(AppFont.songti(28))
                .foregroundStyle(Theme.ink)
                .padding(.top, 22)
                .accessibilityAddTraits(.isHeader)

            Text(selectedTab.emptyCopy)
                .font(.system(size: 14))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .lineSpacing(6)
                .frame(maxWidth: 300)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 10)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - 单条动态

private struct PostCard: View {
    let post: FeedPost
    var onComment: () -> Void
    var onLike: () -> Void
    var onTapImage: (URL) -> Void
    var onTapVideo: (URL) -> Void

    private var isLiked: Bool { post.isVoted ?? false }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                avatar

                VStack(alignment: .leading, spacing: 3) {
                    Text(post.displayName)
                        .font(.system(size: 15.5, weight: .semibold))
                        .foregroundStyle(Theme.ink)

                    Text(post.timeText)
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.muted)
                }
                .padding(.top, 1)

                Spacer(minLength: 0)
            }

            if let content = post.content, !content.isEmpty {
                Text(content)
                    .font(.system(size: 16))
                    .lineSpacing(6)
                    .foregroundStyle(Theme.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 14)
            }

            if !post.items.isEmpty {
                photoGrid
                    .padding(.top, 14)
            }

            actionBar
                .padding(.top, 12)
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Theme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Theme.line, lineWidth: 1)
        )
    }

    private var avatar: some View {
        ZStack {
            Circle()
                .fill(post.user?.color ?? Theme.tealSoft)
                .frame(width: 46, height: 46)

            if let url = post.user?.avatarURL.flatMap(URL.init(string:)) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Text(post.initial)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(Theme.ink)
                }
                .frame(width: 46, height: 46)
                .clipShape(Circle())
            } else {
                Text(post.initial)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(Theme.ink)
            }
        }
        .accessibilityLabel("\(post.displayName)的头像")
    }

    private var photoGrid: some View {
        LazyVGrid(columns: gridColumns, spacing: 8) {
            ForEach(post.items) { item in
                switch item {
                case .image(let url):
                    RemotePhoto(url: url, aspect: singleAspect)
                        .contentShape(Rectangle())
                        .onTapGesture { onTapImage(url) }
                        .accessibilityAddTraits(.isButton)
                        .help("查看大图")
                case .video(let url, let thumbnail):
                    VideoTile(thumbnail: thumbnail, aspect: singleAspect) {
                        onTapVideo(url)
                    }
                }
            }
        }
    }

    private var singleAspect: CGFloat {
        post.items.count == 1 ? 16.0 / 9.0 : 1
    }

    /// 一张占满整行，两张并排，三张以上走九宫格。
    private var gridColumns: [GridItem] {
        let count = post.items.count
        let columns = count == 1 ? 1 : (count == 2 ? 2 : 3)
        return Array(repeating: GridItem(.flexible(), spacing: 8), count: columns)
    }

    private var actionBar: some View {
        HStack(spacing: 0) {
            Button(action: onComment) {
                actionLabel(icon: "bubble.left", count: "\(post.commentsCount ?? 0)", active: false)
            }
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity)
            .help("查看评论")
            .accessibilityLabel("查看评论")

            Button(action: onLike) {
                actionLabel(
                    icon: isLiked ? "heart.fill" : "heart",
                    count: "\(post.voteCount)",
                    active: isLiked
                )
            }
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity)
            .help(isLiked ? "取消点赞" : "点赞")
            .accessibilityLabel(isLiked ? "取消点赞" : "点赞")
        }
        .frame(height: 40)
    }

    private func actionLabel(icon: String, count: String, active: Bool) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .regular))

            Text(count)
                .font(.system(size: 12.5))
                .monospacedDigit()
        }
        .foregroundStyle(active ? Theme.tealDeep : Theme.muted)
        .contentShape(Rectangle())
        .frame(maxWidth: .infinity, minHeight: 40)
    }
}

private struct VideoTile: View {
    let thumbnail: URL?
    let aspect: CGFloat
    let onTap: () -> Void

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                Color.black.opacity(0.82)

                if let thumbnail {
                    AsyncImage(url: thumbnail) { phase in
                        if let image = phase.image {
                            image.resizable().scaledToFill()
                        } else if phase.error != nil {
                            Color.clear
                        } else {
                            ProgressView().controlSize(.small)
                        }
                    }
                    .frame(width: proxy.size.width, height: proxy.size.height)
                    .clipped()
                }

                Image(systemName: "play.circle.fill")
                    .font(.system(size: 34, weight: .regular))
                    .foregroundStyle(.white.opacity(0.92))
                    .shadow(color: .black.opacity(0.4), radius: 6)
            }
        }
        .aspectRatio(aspect, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
        .accessibilityAddTraits(.isButton)
        .help("播放视频")
        .accessibilityLabel("播放视频")
    }
}

/// SwiftUI 的 VideoPlayer 在 SPM 裸可执行文件里会因 Objective-C 元数据问题崩溃，
/// 这里直接用 AVKit 的 AVPlayerView 包一层。
private struct PlayerSurface: NSViewRepresentable {
    let player: AVPlayer

    func makeNSView(context: Context) -> AVPlayerView {
        let view = AVPlayerView()
        view.player = player
        view.controlsStyle = .floating
        view.videoGravity = .resizeAspect
        view.allowsPictureInPicturePlayback = false
        return view
    }

    func updateNSView(_ nsView: AVPlayerView, context: Context) {
        if nsView.player !== player { nsView.player = player }
    }
}

private struct VideoOverlay: View {
    let url: URL
    let onClose: () -> Void

    @State private var player: AVPlayer

    init(url: URL, onClose: @escaping () -> Void) {
        self.url = url
        self.onClose = onClose
        _player = State(initialValue: AVPlayer(url: url))
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.92)
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture(perform: close)

            PlayerSurface(player: player)
                .aspectRatio(16.0 / 9.0, contentMode: .fit)
                .padding(.horizontal, 56)
                .padding(.vertical, 44)

            VStack {
                HStack {
                    Spacer()
                    Button(action: close) {
                        Image(systemName: "xmark")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 30, height: 30)
                            .background(Circle().fill(.white.opacity(0.16)))
                    }
                    .buttonStyle(.plain)
                    .keyboardShortcut(.cancelAction)
                    .help("关闭")
                    .accessibilityLabel("关闭视频")
                }
                Spacer()
            }
            .padding(20)
        }
        .onAppear { player.play() }
        .onDisappear { player.pause() }
    }

    private func close() {
        player.pause()
        onClose()
    }
}

private struct ImagePreview: View {
    let url: URL
    let onClose: () -> Void

    @State private var scale: CGFloat = 0.96

    var body: some View {
        ZStack {
            Color.black.opacity(0.86)
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture(perform: close)

            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFit()
                        .shadow(color: .black.opacity(0.35), radius: 24, y: 12)
                case .failure:
                    VStack(spacing: 10) {
                        Image(systemName: "photo.badge.exclamationmark")
                            .font(.system(size: 30))
                        Text("图片加载失败").font(.system(size: 13))
                    }
                    .foregroundStyle(.white.opacity(0.85))
                case .empty:
                    ProgressView().controlSize(.large)
                @unknown default:
                    EmptyView()
                }
            }
            .padding(.horizontal, 64)
            .padding(.vertical, 56)
            .scaleEffect(scale)

            VStack {
                HStack {
                    Spacer()
                    Button(action: close) {
                        Image(systemName: "xmark")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 30, height: 30)
                            .background(Circle().fill(.white.opacity(0.16)))
                    }
                    .buttonStyle(.plain)
                    .keyboardShortcut(.cancelAction)
                    .help("关闭")
                    .accessibilityLabel("关闭大图")
                }
                Spacer()
            }
            .padding(20)
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.18)) { scale = 1 }
        }
    }

    private func close() {
        onClose()
    }
}

private struct RemotePhoto: View {
    let url: URL
    var aspect: CGFloat = 1

    var body: some View {
        // 用 GeometryReader 兜住：图片自身尺寸不能参与布局，
        // 否则 LazyVGrid 的分栏会被撑歪，右边缘还会溢出卡片。
        GeometryReader { proxy in
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                case .failure:
                    placeholder
                case .empty:
                    ProgressView().controlSize(.small)
                @unknown default:
                    placeholder
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .clipped()
        }
        .aspectRatio(aspect, contentMode: .fit)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Theme.paper)
        )
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .accessibilityLabel("动态配图")
    }

    private var placeholder: some View {
        Image(systemName: "photo")
            .font(.system(size: 16, weight: .regular))
            .foregroundStyle(Theme.faint)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - 评论

private struct CommentsSheet: View {
    let post: FeedPost
    @ObservedObject var store: FollowingStore

    @Environment(\.dismiss) private var dismiss
    @State private var liked: Set<String> = []
    @State private var expanded: Set<String> = []
    @State private var draft = ""
    @State private var replyTarget: FeedComment?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                Text("评论 \(store.comments.count)")
                    .font(AppFont.songti(24))
                    .foregroundStyle(Theme.ink)

                Spacer(minLength: 12)

                Button("关闭") {
                    dismiss()
                }
                .buttonStyle(.plain)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.muted)
            }

            Rectangle()
                .fill(Theme.line)
                .frame(height: 1)
                .padding(.top, 14)

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if store.commentsLoading && store.comments.isEmpty {
                        ProgressView()
                            .controlSize(.small)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 30)
                    } else if store.comments.isEmpty {
                        Text("还没有评论")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.muted)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 30)
                    } else {
                        VStack(alignment: .leading, spacing: 18) {
                            ForEach(store.comments) { comment in
                                VStack(alignment: .leading, spacing: 10) {
                                    commentRow(comment)
                                    repliesSection(comment)
                                }
                            }
                            commentsFooter
                        }
                    }
                }
                .padding(.vertical, 18)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollIndicators(.hidden)

            Rectangle()
                .fill(Theme.line)
                .frame(height: 1)

            commentComposer
                .padding(.top, 12)
        }
        .padding(24)
        .frame(width: 440, height: 470)
        .background(Theme.surface)
        .task {
            await store.loadComments(postID: post.id)
        }
    }

    // MARK: 发表评论

    private var commentComposer: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let error = store.commentError {
                Text(error)
                    .font(.system(size: 11.5))
                    .foregroundStyle(.red)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 10) {
                TextField(
                    "",
                    text: $draft,
                    prompt: Text(replyTarget.map { "回复 \($0.displayName)…" } ?? "写下你的评论…")
                        .foregroundColor(Theme.faint)
                )
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 12)
                    .frame(height: 36)
                    .background(
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .fill(Theme.paper)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .strokeBorder(Theme.line, lineWidth: 1)
                    )
                    .onSubmit { submitComment() }

                if replyTarget != nil {
                    Button {
                        replyTarget = nil
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(Theme.muted)
                            .frame(width: 26, height: 36)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .help("取消回复")
                }

                Button(action: submitComment) {
                    Text(isSending ? "发送中…" : "发送")
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(canSend ? Theme.tealInk : Theme.faint)
                        .padding(.horizontal, 14)
                        .frame(height: 36)
                        .background(
                            RoundedRectangle(cornerRadius: 9, style: .continuous)
                                .fill(canSend ? Theme.teal : Theme.paper)
                        )
                }
                .buttonStyle(.plain)
                .disabled(!canSend)
            }
        }
    }

    private var isSending: Bool { store.isPostingComment || store.isPostingReply }

    private var canSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSending
    }

    private func submitComment() {
        guard canSend else { return }
        let text = draft
        let target = replyTarget
        Task {
            let ok: Bool
            if let target {
                ok = await store.postReply(commentID: target.id, content: text)
                if ok { expanded.insert(target.id) }
            } else {
                ok = await store.postComment(postID: post.id, content: text)
            }
            if ok {
                draft = ""
                replyTarget = nil
            }
        }
    }

    // MARK: 楼中楼

    @ViewBuilder
    private func repliesSection(_ comment: FeedComment) -> some View {
        let count = comment.repliesCount ?? 0
        if count > 0 {
            VStack(alignment: .leading, spacing: 10) {
                Button {
                    if expanded.contains(comment.id) {
                        expanded.remove(comment.id)
                    } else {
                        expanded.insert(comment.id)
                        Task { await store.loadReplies(commentID: comment.id) }
                    }
                } label: {
                    Text(expanded.contains(comment.id) ? "收起回复" : "查看 \(count) 条回复")
                        .font(.system(size: 11.5, weight: .medium))
                        .foregroundStyle(Theme.tealDeep)
                }
                .buttonStyle(.plain)

                if expanded.contains(comment.id) {
                    if store.loadingReplies.contains(comment.id) {
                        ProgressView()
                            .controlSize(.small)
                            .padding(.vertical, 6)
                    } else {
                        ForEach(store.replies[comment.id] ?? []) { reply in
                            replyRow(reply)
                        }
                    }
                }
            }
            .padding(.leading, 40)
        }
    }

    private func replyRow(_ reply: FeedComment) -> some View {
        HStack(alignment: .top, spacing: 8) {
            replyAvatar(reply)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(reply.displayName)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.ink)

                    if reply.isAuthor == true {
                        Text("作者")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(Theme.tealDeep)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1.5)
                            .background(
                                RoundedRectangle(cornerRadius: 3, style: .continuous)
                                    .fill(Theme.tealSoft)
                            )
                    }

                    Text(reply.timeText)
                        .font(.system(size: 10.5))
                        .foregroundStyle(Theme.faint)
                }

                Text(reply.content ?? "")
                    .font(.system(size: 12.5))
                    .lineSpacing(4)
                    .foregroundStyle(Theme.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
    }

    private func replyAvatar(_ reply: FeedComment) -> some View {
        ZStack {
            Circle()
                .fill(reply.user?.color ?? Theme.tealSoft)
                .frame(width: 24, height: 24)

            if let url = reply.avatarURL {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Text(reply.initial)
                        .font(.system(size: 9.5, weight: .semibold))
                        .foregroundStyle(Theme.tealDeep)
                }
                .frame(width: 24, height: 24)
                .clipShape(Circle())
            } else {
                Text(reply.initial)
                    .font(.system(size: 9.5, weight: .semibold))
                    .foregroundStyle(Theme.tealDeep)
            }
        }
        .accessibilityLabel("\(reply.displayName)的头像")
    }

    @ViewBuilder
    private var commentsFooter: some View {
        if store.isLoadingMoreComments {
            ProgressView()
                .controlSize(.small)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
        } else if store.canLoadMoreComments && !store.comments.isEmpty {
            Color.clear
                .frame(height: 1)
                .onAppear {
                    Task { await store.loadMoreComments() }
                }
        }
    }

    private func commentRow(_ comment: FeedComment) -> some View {
        let isLiked = (comment.isVoted ?? false) != liked.contains(comment.id)

        return HStack(alignment: .top, spacing: 10) {
            commentAvatar(comment)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(comment.displayName)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.ink)

                    if comment.isAuthor == true {
                        Text("作者")
                            .font(.system(size: 9.5, weight: .semibold))
                            .foregroundStyle(Theme.tealDeep)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(
                                RoundedRectangle(cornerRadius: 4, style: .continuous)
                                    .fill(Theme.tealSoft)
                            )
                            .accessibilityLabel("作者")
                    }

                    Text(comment.timeText)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.faint)
                }

                Text(comment.content ?? "")
                    .font(.system(size: 13.5))
                    .lineSpacing(5)
                    .foregroundStyle(Theme.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 8)

            Button {
                replyTarget = comment
            } label: {
                Text("回复")
                    .font(.system(size: 11.5, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .frame(minWidth: 34, minHeight: 32)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("回复这条评论")
            .accessibilityLabel("回复这条评论")

            Button {
                withAnimation(.easeOut(duration: 0.14)) {
                    if liked.contains(comment.id) {
                        liked.remove(comment.id)
                    } else {
                        liked.insert(comment.id)
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: isLiked ? "heart.fill" : "heart")
                        .font(.system(size: 12.5, weight: .regular))

                    Text("\(max(0, (comment.isVoted == true ? 1 : 0) + (isLiked ? 1 : 0)))")
                        .font(.system(size: 11.5))
                        .monospacedDigit()
                }
                .foregroundStyle(isLiked ? Theme.tealDeep : Theme.muted)
                .frame(minWidth: 34, minHeight: 32)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help(isLiked ? "取消赞这条评论" : "赞这条评论")
            .accessibilityLabel(isLiked ? "取消赞评论" : "赞评论")
        }
    }

    @ViewBuilder
    private func commentAvatar(_ comment: FeedComment) -> some View {
        ZStack {
            Circle()
                .fill(comment.user?.color ?? Theme.tealSoft)
                .frame(width: 30, height: 30)

            if let url = comment.avatarURL {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Text(comment.initial)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.tealDeep)
                }
                .frame(width: 30, height: 30)
                .clipShape(Circle())
            } else {
                Text(comment.initial)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.tealDeep)
            }
        }
        .accessibilityLabel("\(comment.displayName)的头像")
    }
}

private struct PublishButton: View {
    let action: () -> Void

    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: "plus")
                    .font(.system(size: 11, weight: .semibold))

                Text("发布动态")
                    .font(.system(size: 13, weight: .semibold))
            }
            .foregroundStyle(Theme.tealInk)
            .padding(.horizontal, 14)
            .frame(height: 36)
            .background(
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(hovering ? Color(hex: 0x00C9C2) : Theme.teal)
            )
            .contentShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .help("发布动态")
        .accessibilityLabel("发布动态")
    }
}
