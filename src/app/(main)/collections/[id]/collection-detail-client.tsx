"use client";

import dynamic from "next/dynamic";

import { PageHeader } from "@/components/page-header";
import { KeyboardShortcutsHelpButton } from "@/components/keyboard-shortcuts-help-button";
import {
  COLLECTION_DETAIL_SHORTCUT_GROUPS,
  useCollectionDetailPage,
} from "@/hooks/use-collection-detail-page";
import {
  CollectionDetailBookmarkList,
  CollectionDetailDescription,
  CollectionDetailErrorState,
  CollectionDetailLoadingState,
} from "./collection-detail-bookmark-list";
import {
  CollectionDetailBackButton,
  CollectionDetailHeaderActions,
  CollectionDetailTitle,
} from "./collection-detail-header";

const ShareDialog = dynamic(
  () => import("@/components/share-dialog").then((m) => m.ShareDialog),
  { ssr: false }
);

export default function CollectionDetailClient({
  collectionId,
}: {
  collectionId: string;
}) {
  const page = useCollectionDetailPage(collectionId);
  const {
    collection,
    isPending,
    isError,
    refetch,
    isNotFound,
    sortedItems,
    aboveFoldMediaBookmarkId,
    isSyncedFromX,
    isUserCollection,
    itemCountLabel,
    editingName,
    name,
    setName,
    reordering,
    shareOpen,
    setShareOpen,
    shareContent,
    activeBookmarkId,
    setActiveBookmarkId,
    keyboardShortcutsOpen,
    setKeyboardShortcutsOpen,
    cancelEditingName,
    startEditingName,
    handleCopyAsCollection,
    handleTogglePublic,
    handleCopyShareLink,
    handleRemoveItem,
    handleShareOnX,
    handleUpdateName,
    moveItem,
    goToCollections,
    goToDashboard,
  } = page;

  if (isPending) {
    return <CollectionDetailLoadingState />;
  }

  if (isError || !collection) {
    return (
      <CollectionDetailErrorState
        isNotFound={isNotFound}
        onRetry={() => refetch()}
        onBack={goToCollections}
      />
    );
  }

  return (
    <div className="app-shell-bg app-viewport flex flex-col overflow-x-hidden">
      <div className="app-main-scroll scrollbar-thin">
        <PageHeader
          sticky
          titleClassName="text-2xl sm:text-3xl"
          title={
            <CollectionDetailTitle
              collection={collection}
              editingName={editingName}
              name={name}
              isSyncedFromX={isSyncedFromX}
              isUserCollection={isUserCollection}
              onNameChange={setName}
              onUpdateName={handleUpdateName}
              onCancelEditingName={cancelEditingName}
              onStartEditingName={startEditingName}
            />
          }
          description={itemCountLabel}
          leading={<CollectionDetailBackButton onBack={goToCollections} />}
          actions={
            <>
              <CollectionDetailHeaderActions
                collection={collection}
                sortedItemCount={sortedItems.length}
                isSyncedFromX={isSyncedFromX}
                isUserCollection={isUserCollection}
                onCopyAsCollection={handleCopyAsCollection}
                onTogglePublic={handleTogglePublic}
                onCopyShareLink={handleCopyShareLink}
                onShareOnX={handleShareOnX}
              />
              <KeyboardShortcutsHelpButton
                open={keyboardShortcutsOpen}
                onOpenChange={setKeyboardShortcutsOpen}
                groups={COLLECTION_DETAIL_SHORTCUT_GROUPS}
                description="Collection bookmark navigation and collection actions."
              />
            </>
          }
        />

        <main className="mx-auto max-w-5xl px-4 pb-10 sm:px-5">
          {collection.description ? (
            <CollectionDetailDescription description={collection.description} />
          ) : null}

          <CollectionDetailBookmarkList
            sortedItems={sortedItems}
            isSyncedFromX={isSyncedFromX}
            aboveFoldMediaBookmarkId={aboveFoldMediaBookmarkId}
            activeBookmarkId={activeBookmarkId}
            reordering={reordering}
            onSelectBookmark={setActiveBookmarkId}
            onRemoveItem={handleRemoveItem}
            onMoveItem={moveItem}
            onGoToDashboard={goToDashboard}
          />
        </main>
      </div>

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        shareContent={shareContent}
      />
    </div>
  );
}
